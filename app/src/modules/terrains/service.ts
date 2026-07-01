import { forOrg, withOrg, type Prisma } from '@veriterra/db';
import type { GeoJsonGeometry } from '@/lib/geo/types';
import { getEnrichTerrainQueue } from '@/lib/queues';
import { ensureProjet } from '@/modules/projet/service';
import type { CreateTerrainInput, TerrainSummary, UpdateTerrainInput } from './types';

const PARCELLE_SOURCE = 'IGN API Carto Cadastre';

/** Statuts de terrain admissibles (aligné sur l'enum Prisma `TerrainStatus`). */
export const TERRAIN_STATUSES = ['A_ETUDIER', 'PROMETTEUR', 'RESERVE', 'ECARTE'] as const;
export type TerrainStatusValue = (typeof TERRAIN_STATUSES)[number];

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

  await getEnrichTerrainQueue().add('enrichTerrain', { organizationId: orgId, terrainId });

  const summary = await getTerrain(orgId, terrainId);
  if (!summary) throw new Error('Terrain introuvable après création.');
  return summary;
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
