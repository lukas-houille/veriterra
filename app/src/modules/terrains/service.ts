import { forOrg, withOrg, type Prisma } from '@veriterra/db';
import type { PenteData, PluData, PrixDvfData, RisquesData, ServicesData } from '@veriterra/enrichment';
import type { GeoJsonGeometry } from '@/lib/geo/types';
import { getEnrichTerrainQueue } from '@/lib/queues';
import { deleteObject } from '@/lib/storage/s3';
import { ensureProjet, getActiveProjet } from '@/modules/projet/service';
import type { ProjetSummary } from '@/modules/projet/types';
import { scoreTerrain, type ScoreResult, type ScoringInput } from './scoring';
import { EXPECTED_ENRICHMENT_TYPES, buildEnrichmentView } from './enrichment-view';
import { TERRAIN_STATUSES, type TerrainStatusValue } from './status';
import type {
  CreateTerrainInput,
  EnrichmentBlockView,
  EnrichmentView,
  TerrainSummary,
  UpdateTerrainInput,
} from './types';

const PARCELLE_SOURCE = 'IGN API Carto Cadastre';

/** Délai max d'attente de l'enfilement de l'enrichissement à la création (effet de bord best-effort). */
const ENQUEUE_TIMEOUT_MS = 4000;
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Statuts de terrain admissibles : source unique dans `status.ts` (alignée sur l'enum Prisma
// `TerrainStatus`). Ré-exportés ici pour les consommateurs serveur (route PATCH) sans changer leurs imports.
export { TERRAIN_STATUSES, type TerrainStatusValue };

/** Valide qu'une valeur est bien une géométrie GeoJSON Polygon/MultiPolygon exploitable. */
function isValidGeometry(g: unknown): g is GeoJsonGeometry {
  if (typeof g !== 'object' || g === null) return false;
  const type = (g as { type?: unknown }).type;
  const coordinates = (g as { coordinates?: unknown }).coordinates;
  return (type === 'Polygon' || type === 'MultiPolygon') && Array.isArray(coordinates);
}

// Forme minimale d'une ligne terrain incluant ses parcelles (évite de dépendre des types
// Prisma générés, notamment de la colonne géométrie `Unsupported`).
type TerrainRow = {
  id: string;
  label: string;
  address: string;
  inseeCode: string;
  status: string;
  prixDemande: unknown;
  lienAnnonce: string | null;
  notes: string | null;
  createdAt: Date;
  parcelles: Array<{
    id: string;
    idu: string;
    commune: string;
    section: string;
    numero: string;
    surfaceM2: number;
    geojson: unknown;
  }>;
};

function toSummary(t: TerrainRow): TerrainSummary {
  const parcelles = t.parcelles.map((p) => ({
    id: p.id,
    idu: p.idu,
    commune: p.commune,
    section: p.section,
    numero: p.numero,
    surfaceM2: p.surfaceM2,
    geojson: p.geojson as GeoJsonGeometry,
  }));
  return {
    id: t.id,
    label: t.label,
    address: t.address,
    inseeCode: t.inseeCode,
    status: t.status,
    prixDemande: t.prixDemande == null ? null : Number(t.prixDemande),
    lienAnnonce: t.lienAnnonce,
    notes: t.notes,
    surfaceTotaleM2: parcelles.reduce((sum, p) => sum + p.surfaceM2, 0),
    createdAt: t.createdAt.toISOString(),
    parcelles,
  };
}

/**
 * Crée un terrain à partir des IDU de parcelles choisis. Re-récupère les données
 * parcellaires faisant autorité côté serveur (source + date), persiste terrain + parcelles
 * dans une seule transaction tenant (RLS via `withOrg`), peuple la géométrie PostGIS, puis
 * enfile l'enrichissement en arrière-plan (stub en Tranche 1).
 */
export async function createTerrain(
  orgId: string,
  userId: string | null,
  input: CreateTerrainInput,
): Promise<TerrainSummary> {
  const parcelles = input.parcelles;
  const first = parcelles[0];
  if (!first) throw new Error('Au moins une parcelle est requise.');
  // On ne fait pas confiance aveuglément à la géométrie du client : on la valide avant
  // ST_GeomFromGeoJSON (la donnée provient d'API Carto au clic, mais on borne quand même).
  for (const p of parcelles) {
    if (!isValidGeometry(p.geojson)) {
      throw new Error(`Géométrie invalide pour la parcelle ${p.idu}.`);
    }
  }
  const label =
    input.label?.trim() ||
    `${first.commune} ${first.section} ${parcelles.map((p) => p.numero).join(', ')}`.trim();

  // Tout terrain est rattaché au projet actif de l'organisation (créé si besoin).
  const projet = await ensureProjet(orgId);

  const terrainId = await withOrg(orgId, async (tx) => {
    const terrain = await tx.terrain.create({
      data: {
        organisationId: orgId,
        projetId: projet.id,
        createdById: userId ?? undefined,
        label,
        address: input.address,
        inseeCode: input.inseeCode,
        prixDemande: input.prixDemande ?? undefined,
        lienAnnonce: input.lienAnnonce ?? undefined,
        notes: input.notes ?? undefined,
      },
    });
    for (const p of parcelles) {
      const created = await tx.terrainParcelle.create({
        data: {
          organisationId: orgId,
          terrainId: terrain.id,
          idu: p.idu,
          commune: p.commune,
          section: p.section,
          numero: p.numero,
          surfaceM2: p.surfaceM2,
          geojson: p.geojson as unknown as Prisma.InputJsonValue,
          source: PARCELLE_SOURCE,
        },
      });
      // Géométrie PostGIS depuis le GeoJSON, dans la même transaction tenant (RLS scoped).
      // ST_Multi coince au type MultiPolygon, ST_SetSRID garantit le SRID 4326.
      await tx.$executeRaw`
        UPDATE "TerrainParcelle"
        SET geom = ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(geojson::text)), 4326)
        WHERE id = ${created.id}::uuid
      `;
    }
    return terrain.id;
  });

  // Effet de bord POST-commit : ne doit JAMAIS transformer une création réussie en échec client
  // (le terrain est déjà persisté). Best-effort et borné dans le temps : si Redis est indisponible,
  // l'enfilement ne doit pas faire traîner la requête jusqu'au 502 de la façade. Les blocs restent
  // PENDING et un « Actualiser » relancera le job.
  const enqueued = enqueueTerrainEnrichment(orgId, terrainId).catch((err) => {
    console.error(`[createTerrain] enfilement de l'enrichissement échoué pour ${terrainId}:`, err);
  });
  await Promise.race([enqueued, delay(ENQUEUE_TIMEOUT_MS)]);

  const summary = await getTerrain(orgId, terrainId);
  if (!summary) throw new Error('Terrain introuvable après création.');
  return summary;
}

/**
 * Supprime un terrain de l'organisation (scopé RLS). Le cascade DB retire parcelles, blocs
 * d'enrichissement et lignes de documents ; les objets S3 des documents sont retirés best-effort
 * (un objet orphelin est moins grave qu'une requête bloquée). Renvoie false si le terrain
 * n'existe pas dans le tenant (ou appartient à une autre organisation, invisible via RLS).
 */
export async function deleteTerrain(orgId: string, id: string): Promise<boolean> {
  const db = forOrg(orgId);
  const terrain = await db.terrain.findUnique({ where: { id }, select: { id: true } });
  if (!terrain) return false;

  // Clés S3 des documents à nettoyer après suppression (le cascade retire les lignes en base).
  const docs = (await db.terrainDocument.findMany({
    where: { terrainId: id },
    select: { storageKey: true },
  })) as Array<{ storageKey: string }>;

  try {
    await db.terrain.delete({ where: { id } });
  } catch (e) {
    if ((e as { code?: unknown }).code === 'P2025') return false;
    throw e;
  }
  await Promise.all(docs.map((d) => deleteObject(d.storageKey).catch(() => undefined)));
  return true;
}

/**
 * Enfile un job d'enrichissement. `jobId` idempotent : à la création (`enrich:<terrainId>`) un
 * clic multiple ou une reprise ne duplique pas le job ; un rafraîchissement forcé utilise un
 * jobId horodaté pour toujours re-tourner (et contourner le cache via `force`).
 */
export async function enqueueTerrainEnrichment(
  orgId: string,
  terrainId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  // Marque les blocs attendus en PENDING (crée si absent) AVANT d'enfiler : la fiche affiche
  // aussitôt l'état "en cours" (préchargement non bloquant, US-1.4) et le rafraîchissement
  // manuel redevient observable (anyPending repasse à vrai, le polling suit jusqu'au terminal).
  const db = forOrg(orgId);
  for (const type of EXPECTED_ENRICHMENT_TYPES) {
    await db.enrichmentBlock.upsert({
      where: { terrainId_type: { terrainId, type } },
      create: { organisationId: orgId, terrainId, type, status: 'PENDING' },
      update: { status: 'PENDING', error: null },
    });
  }
  const jobId = opts.force ? `enrich:${terrainId}:r${Date.now()}` : `enrich:${terrainId}`;
  await getEnrichTerrainQueue().add(
    'enrichTerrain',
    { organizationId: orgId, terrainId, force: opts.force },
    { jobId },
  );
}

// Forme minimale d'une ligne EnrichmentBlock (évite de dépendre des types Prisma générés).
type EnrichmentRow = {
  type: string;
  status: string;
  source: string | null;
  sourceUrl: string | null;
  confidence: string | null;
  fetchedAt: Date | null;
  data: unknown;
  error: string | null;
};

/** Vue d'enrichissement d'un terrain (blocs sourcés + placeholders des types attendus). */
export async function getTerrainEnrichment(orgId: string, terrainId: string): Promise<EnrichmentView> {
  const rows = (await forOrg(orgId).enrichmentBlock.findMany({
    where: { terrainId },
  })) as unknown as EnrichmentRow[];
  const existing: EnrichmentBlockView[] = rows.map((r) => ({
    type: r.type,
    status: r.status as EnrichmentBlockView['status'],
    source: r.source,
    sourceUrl: r.sourceUrl,
    confidence: r.confidence as EnrichmentBlockView['confidence'],
    fetchedAt: r.fetchedAt ? r.fetchedAt.toISOString() : null,
    data: (r.data ?? null) as RisquesData | PrixDvfData | PenteData | ServicesData | PluData | null,
    error: r.error,
  }));
  return buildEnrichmentView(existing);
}

export async function listTerrains(orgId: string): Promise<TerrainSummary[]> {
  const rows = (await forOrg(orgId).terrain.findMany({
    include: { parcelles: true },
    orderBy: { createdAt: 'desc' },
  })) as unknown as TerrainRow[];
  return rows.map(toSummary);
}

export async function getTerrain(orgId: string, id: string): Promise<TerrainSummary | null> {
  const row = (await forOrg(orgId).terrain.findUnique({
    where: { id },
    include: { parcelles: true },
  })) as unknown as TerrainRow | null;
  return row ? toSummary(row) : null;
}

/**
 * Modifie les champs manuels et le statut d'un terrain (US-1.9). Mise à jour partielle :
 * seuls les champs fournis sont écrits. Scopé au tenant via `forOrg` (RLS) : le terrain d'une
 * autre organisation est invisible, donc renvoie `null` (aucune modification inter-org). Ne
 * touche pas aux données parcellaires faisant autorité (contour, surface, IDU).
 */
export async function updateTerrain(
  orgId: string,
  id: string,
  input: UpdateTerrainInput,
): Promise<TerrainSummary | null> {
  // Vérifie l'existence dans le tenant courant avant d'écrire (update sur un id absent
  // lèverait sinon, et un id d'une autre org est invisible sous RLS).
  const existing = (await forOrg(orgId).terrain.findUnique({ where: { id } })) as { id: string } | null;
  if (!existing) return null;

  const data: Prisma.TerrainUpdateInput = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (label) data.label = label;
  }
  if (input.address !== undefined) {
    const address = input.address.trim();
    if (address) data.address = address;
  }
  if (input.status !== undefined) {
    if (!(TERRAIN_STATUSES as readonly string[]).includes(input.status)) {
      throw new Error('Statut de terrain invalide.');
    }
    data.status = input.status as TerrainStatusValue;
  }
  if (input.prixDemande !== undefined) data.prixDemande = input.prixDemande;
  if (input.lienAnnonce !== undefined) data.lienAnnonce = input.lienAnnonce;
  if (input.notes !== undefined) data.notes = input.notes;

  try {
    await forOrg(orgId).terrain.update({ where: { id }, data });
  } catch (e) {
    // P2025 : la ligne a disparu (ou est devenue invisible sous RLS) entre le findUnique et
    // l'update. On renvoie null (404) plutôt qu'une 500, au lieu de faire confiance au guard.
    if ((e as { code?: unknown }).code === 'P2025') return null;
    throw e;
  }
  return getTerrain(orgId, id);
}

// ---------- Scoring (Tranche 3) : dérivé des données déjà sourcées, calculé à la lecture ----------

/** Construit l'entrée du moteur de score depuis un terrain, le projet et ses blocs (par type). */
function toScoringInput(
  terrain: Pick<TerrainSummary, 'prixDemande' | 'surfaceTotaleM2'>,
  projet: ProjetSummary | null,
  blocks: Array<Pick<EnrichmentBlockView, 'type' | 'data'>>,
): ScoringInput {
  const dataByType = new Map(blocks.map((b) => [b.type, b.data ?? null]));
  const get = (type: string) => dataByType.get(type) ?? null;
  return {
    prixDemande: terrain.prixDemande,
    surfaceTotaleM2: terrain.surfaceTotaleM2,
    budgetMax: projet?.budgetMax ?? null,
    surfaceMinM2: projet?.surfaceMinM2 ?? null,
    surfaceMaxM2: projet?.surfaceMaxM2 ?? null,
    risques: get('RISQUES') as ScoringInput['risques'],
    prixDvf: get('PRIX_DVF') as ScoringInput['prixDvf'],
    pente: get('PENTE') as ScoringInput['pente'],
    services: get('SERVICES') as ScoringInput['services'],
    plu: get('PLU') as ScoringInput['plu'],
  };
}

/** Score d'un terrain à partir d'une vue déjà chargée (fiche : évite de refetcher l'enrichissement). */
export function scoreTerrainView(
  terrain: Pick<TerrainSummary, 'prixDemande' | 'surfaceTotaleM2'>,
  projet: ProjetSummary | null,
  blocks: Array<Pick<EnrichmentBlockView, 'type' | 'data'>>,
): ScoreResult {
  return scoreTerrain(toScoringInput(terrain, projet, blocks));
}

/** Terrain enrichi de son score global (tableau comparatif du dashboard). */
export interface TerrainWithScore extends TerrainSummary {
  score: number | null;
  evaluated: number;
  redFlags: number;
}

/**
 * Liste les terrains avec leur score global (US-3.3). Charge en UN SEUL findMany tous les blocs
 * d'enrichissement de l'organisation (scopé tenant via forOrg, pas de N+1), les regroupe par
 * terrain, et calcule chaque score relatif au projet actif.
 */
export async function listTerrainsWithScores(orgId: string): Promise<TerrainWithScore[]> {
  const [terrains, projet] = await Promise.all([listTerrains(orgId), getActiveProjet(orgId)]);
  const blockRows = (await forOrg(orgId).enrichmentBlock.findMany({
    select: { terrainId: true, type: true, data: true },
  })) as unknown as Array<{ terrainId: string; type: string; data: unknown }>;

  const byTerrain = new Map<string, Array<Pick<EnrichmentBlockView, 'type' | 'data'>>>();
  for (const b of blockRows) {
    const arr = byTerrain.get(b.terrainId) ?? [];
    arr.push({ type: b.type, data: (b.data ?? null) as EnrichmentBlockView['data'] });
    byTerrain.set(b.terrainId, arr);
  }

  return terrains.map((t) => {
    const result = scoreTerrainView(t, projet, byTerrain.get(t.id) ?? []);
    return { ...t, score: result.global, evaluated: result.evaluated, redFlags: result.redFlags.length };
  });
}
