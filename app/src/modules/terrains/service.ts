import { forOrg, withOrg, type Prisma } from '@veriterra/db';
import type { PenteData, PluData, PrixDvfData, RisquesData, ServicesData } from '@veriterra/enrichment';
import type { GeoJsonGeometry } from '@/lib/geo/types';
import { getEnrichTerrainQueue } from '@/lib/queues';
import { deleteObject } from '@/lib/storage/s3';
import { ensureProjet, getActiveProjet } from '@/modules/projet/service';
import type { ProjetSummary } from '@/modules/projet/types';
import {
  applyOverrides,
  isCriterionKey,
  scoreTerrain,
  type CriterionKey,
  type CriterionOverride,
  type ScoreResult,
  type ScoringInput,
} from './scoring';
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

/** Score d'un terrain à partir d'une vue déjà chargée (fiche : évite de refetcher l'enrichissement).
 *  Les overrides manuels (US-3.1), s'il y en a, sont appliqués et le global re-renormalisé. */
export function scoreTerrainView(
  terrain: Pick<TerrainSummary, 'prixDemande' | 'surfaceTotaleM2'>,
  projet: ProjetSummary | null,
  blocks: Array<Pick<EnrichmentBlockView, 'type' | 'data'>>,
  overrides?: Map<CriterionKey, CriterionOverride>,
): ScoreResult {
  const result = scoreTerrain(toScoringInput(terrain, projet, blocks));
  return overrides && overrides.size > 0 ? applyOverrides(result, overrides) : result;
}

// ---------- Overrides de score (US-3.1) : corrections manuelles persistées, scopées tenant ----------

type ScoreOverrideRow = {
  terrainId: string;
  criterion: string;
  overrideScore: number;
  note: string | null;
  originalScore: number | null;
  originalBasis: string | null;
};

// Sélection commune : la trace figée (originalScore/originalBasis) DOIT transiter jusqu'au moteur,
// sinon la valeur d'origine affichée suivrait un ré-enrichissement ultérieur (règle 1).
const SCORE_OVERRIDE_SELECT = {
  criterion: true,
  overrideScore: true,
  note: true,
  originalScore: true,
  originalBasis: true,
} as const;

/** Regroupe des lignes d'override en Map par critère (ignore une clé de critère inconnue, règle 3).
 *  Reporte la trace d'origine figée pour que l'affichage n'en dérive pas une nouvelle. */
function toOverrideMap(
  rows: Array<Pick<ScoreOverrideRow, 'criterion' | 'overrideScore' | 'note' | 'originalScore' | 'originalBasis'>>,
): Map<CriterionKey, CriterionOverride> {
  const map = new Map<CriterionKey, CriterionOverride>();
  for (const r of rows) {
    if (isCriterionKey(r.criterion)) {
      map.set(r.criterion, {
        score: r.overrideScore,
        note: r.note,
        originalScore: r.originalScore,
        originalBasis: r.originalBasis,
      });
    }
  }
  return map;
}

/** Charge les overrides d'un terrain (scopé tenant via forOrg/RLS). */
export async function getScoreOverrides(
  orgId: string,
  terrainId: string,
): Promise<Map<CriterionKey, CriterionOverride>> {
  const rows = (await forOrg(orgId).terrainScoreOverride.findMany({
    where: { terrainId },
    select: SCORE_OVERRIDE_SELECT,
  })) as unknown as Array<Pick<ScoreOverrideRow, 'criterion' | 'overrideScore' | 'note' | 'originalScore' | 'originalBasis'>>;
  return toOverrideMap(rows);
}

/** Terrain enrichi de son score global (tableau comparatif du dashboard). */
export interface TerrainWithScore extends TerrainSummary {
  score: number | null;
  evaluated: number;
  redFlags: number;
  /** Communes couvertes (dédupliquées, depuis les parcelles) pour le filtre par commune (US-3.3). */
  communes: string[];
}

/** Communes distinctes couvertes par un terrain, dans l'ordre des parcelles (dédup stable). */
function dedupCommunes(parcelles: TerrainSummary['parcelles']): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parcelles) {
    const c = p.commune?.trim();
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/**
 * Liste les terrains avec leur score global (US-3.3). Charge en UN SEUL findMany tous les blocs
 * d'enrichissement de l'organisation (scopé tenant via forOrg, pas de N+1), les regroupe par
 * terrain, et calcule chaque score relatif au projet actif.
 */
export async function listTerrainsWithScores(orgId: string): Promise<TerrainWithScore[]> {
  const [terrains, projet] = await Promise.all([listTerrains(orgId), getActiveProjet(orgId)]);
  // Blocs d'enrichissement et overrides manuels chargés chacun en UN findMany (pas de N+1),
  // tous deux scopés tenant via forOrg (RLS).
  const [blockRows, overrideRows] = await Promise.all([
    forOrg(orgId).enrichmentBlock.findMany({
      select: { terrainId: true, type: true, data: true },
    }) as unknown as Promise<Array<{ terrainId: string; type: string; data: unknown }>>,
    forOrg(orgId).terrainScoreOverride.findMany({
      select: { terrainId: true, ...SCORE_OVERRIDE_SELECT },
    }) as unknown as Promise<ScoreOverrideRow[]>,
  ]);

  const byTerrain = new Map<string, Array<Pick<EnrichmentBlockView, 'type' | 'data'>>>();
  for (const b of blockRows) {
    const arr = byTerrain.get(b.terrainId) ?? [];
    arr.push({ type: b.type, data: (b.data ?? null) as EnrichmentBlockView['data'] });
    byTerrain.set(b.terrainId, arr);
  }

  const overridesByTerrain = new Map<string, ScoreOverrideRow[]>();
  for (const o of overrideRows) {
    const arr = overridesByTerrain.get(o.terrainId) ?? [];
    arr.push(o);
    overridesByTerrain.set(o.terrainId, arr);
  }

  return terrains.map((t) => {
    const overrides = toOverrideMap(overridesByTerrain.get(t.id) ?? []);
    const result = scoreTerrainView(t, projet, byTerrain.get(t.id) ?? [], overrides);
    return {
      ...t,
      score: result.global,
      evaluated: result.evaluated,
      redFlags: result.redFlags.length,
      communes: dedupCommunes(t.parcelles),
    };
  });
}

/**
 * Pose ou met à jour l'override manuel d'un critère (US-3.1). La trace de la valeur d'origine
 * (`originalScore`/`originalBasis`) est capturée depuis le score CALCULÉ (sans override) et figée à
 * la première pose : la branche `update` ne la réécrit pas (elle reste la valeur dérivée initiale).
 * La lecture pour tracer précède l'upsert (transaction `withOrg`) ; si le terrain disparaît dans
 * l'intervalle, la violation de clé étrangère est mappée en `false` (404) plutôt qu'une 500.
 * Renvoie `false` si le terrain n'existe pas (ou plus) dans le tenant.
 */
export async function setScoreOverride(
  orgId: string,
  terrainId: string,
  criterion: CriterionKey,
  overrideScore: number,
  note: string | null,
  overriddenById: string | null,
): Promise<boolean> {
  const clamped = Math.min(100, Math.max(0, Math.round(overrideScore)));
  // Score dérivé (sans override) pour capturer la valeur d'origine du critère.
  const [terrain, projet, enrichment] = await Promise.all([
    getTerrain(orgId, terrainId),
    getActiveProjet(orgId),
    getTerrainEnrichment(orgId, terrainId),
  ]);
  if (!terrain) return false;
  const base = scoreTerrainView(terrain, projet, enrichment.blocks);
  const originCrit = base.criteria.find((c) => c.key === criterion);
  const originalScore = originCrit ? originCrit.score : null;
  const originalBasis = originCrit ? originCrit.basis : null;
  const trimmedNote = note?.trim() ? note.trim() : null;

  try {
    await withOrg(orgId, async (tx) => {
      await tx.terrainScoreOverride.upsert({
        where: { terrainId_criterion: { terrainId, criterion } },
        // À la création : fige la valeur d'origine (dérivée des données). À la mise à jour : ne touche
        // qu'à la note manuelle et à l'auteur, en préservant la trace d'origine initiale.
        create: {
          organisationId: orgId,
          terrainId,
          criterion,
          overrideScore: clamped,
          originalScore,
          originalBasis,
          note: trimmedNote,
          overriddenById,
        },
        update: { overrideScore: clamped, note: trimmedNote, overriddenById },
      });
    });
  } catch (e) {
    // Course rare : le terrain a été supprimé entre la lecture et l'upsert (FK P2003), ou la ligne
    // a disparu (P2025). On renvoie false (404) plutôt qu'une 500. Toute autre erreur remonte.
    const code = (e as { code?: unknown }).code;
    if (code === 'P2003' || code === 'P2025') return false;
    throw e;
  }
  return true;
}

/** Retire l'override manuel d'un critère (retour au score dérivé). `false` si le terrain est absent
 *  du tenant. Idempotent : supprimer un override inexistant renvoie `true` (état déjà atteint). */
export async function clearScoreOverride(
  orgId: string,
  terrainId: string,
  criterion: CriterionKey,
): Promise<boolean> {
  const terrain = await getTerrain(orgId, terrainId);
  if (!terrain) return false;
  await forOrg(orgId).terrainScoreOverride.deleteMany({ where: { terrainId, criterion } });
  return true;
}
