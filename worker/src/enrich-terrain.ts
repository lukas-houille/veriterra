import { forOrg, Prisma, type ConfidenceLevel, type EnrichmentStatus, type EnrichmentType } from '@veriterra/db';
import type {
  EnrichBlockOutcome,
  EnrichTerrainJobData,
  EnrichTerrainJobResult,
} from '@veriterra/shared';
import {
  DVF_SOURCE,
  DVF_SOURCE_URL,
  PENTE_SOURCE,
  PENTE_SOURCE_URL,
  getPenteCached,
  getPrixDvfCached,
  getRisquesGeorisquesCached,
  summarizePente,
  summarizePrixDvf,
  summarizeRisques,
  type DvfSection,
} from '@veriterra/enrichment';

const GEORISQUES_URL = 'https://www.georisques.gouv.fr/';

/** Collecte récursivement toutes les positions [lon, lat] d'une géométrie GeoJSON imbriquée. */
function collectCoords(coords: unknown, acc: Array<[number, number]>): void {
  if (!Array.isArray(coords)) return;
  const [a, b] = coords;
  if (typeof a === 'number' && typeof b === 'number') {
    acc.push([a, b]);
    return;
  }
  for (const child of coords) collectCoords(child, acc);
}

/** Point représentatif d'une parcelle (moyenne des sommets). null si géométrie vide. */
function centroidOf(geojson: unknown): { lon: number; lat: number } | null {
  const acc: Array<[number, number]> = [];
  collectCoords((geojson as { coordinates?: unknown } | null)?.coordinates, acc);
  if (acc.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of acc) {
    sx += x;
    sy += y;
  }
  return { lon: sx / acc.length, lat: sy / acc.length };
}

type TenantDb = ReturnType<typeof forOrg>;
type TerrainWithParcelles = {
  id: string;
  inseeCode: string;
  parcelles: Array<{ geojson: unknown; idu: string }>;
};

/** Résultat interne d'un enrichissement de bloc : issue affichée + faut-il réessayer le job. */
interface BlockRun {
  outcome: EnrichBlockOutcome;
  retry: boolean;
}

interface BlockFields {
  status: EnrichmentStatus;
  data?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  source: string;
  sourceUrl: string;
  confidence?: ConfidenceLevel | null;
  error?: string | null;
}

/** Upsert d'un bloc (un par terrain+type), provenance et fraîcheur systématiques. */
function upsertBlock(
  db: TenantDb,
  orgId: string,
  terrainId: string,
  type: EnrichmentType,
  fields: BlockFields,
) {
  const common = {
    status: fields.status,
    data: fields.data ?? Prisma.DbNull,
    source: fields.source,
    sourceUrl: fields.sourceUrl,
    confidence: fields.confidence ?? null,
    error: fields.error ?? null,
    fetchedAt: new Date(),
  };
  return db.enrichmentBlock.upsert({
    where: { terrainId_type: { terrainId, type } },
    create: { organisationId: orgId, terrainId, type, ...common },
    update: common,
  });
}

/** Bloc RISQUES (Géorisques). Ne throw pas : signale le besoin de réessai via `retry`. */
async function enrichRisques(
  db: TenantDb,
  orgId: string,
  terrain: TerrainWithParcelles,
  force: boolean,
): Promise<BlockRun> {
  const type: EnrichmentType = 'RISQUES';
  try {
    let centroid: { lon: number; lat: number } | null = null;
    for (const p of terrain.parcelles) {
      centroid = centroidOf(p.geojson);
      if (centroid) break;
    }
    if (!centroid) {
      await upsertBlock(db, orgId, terrain.id, type, { status: 'UNAVAILABLE', source: 'Géorisques', sourceUrl: GEORISQUES_URL });
      return { outcome: { type, status: 'UNAVAILABLE' }, retry: false };
    }
    const { data, transientError } = await getRisquesGeorisquesCached(
      { lon: centroid.lon, lat: centroid.lat, codeInsee: terrain.inseeCode },
      { force },
    );
    const { status, confidence } = summarizeRisques(data);
    if (transientError) {
      if (status === 'UNAVAILABLE') {
        await upsertBlock(db, orgId, terrain.id, type, { status: 'ERROR', source: 'Géorisques', sourceUrl: GEORISQUES_URL, error: 'Géorisques injoignable' });
        return { outcome: { type, status: 'ERROR' }, retry: true };
      }
      // Panne partielle : on garde ce qu'on a obtenu mais on relance pour compléter au prochain essai.
      await upsertBlock(db, orgId, terrain.id, type, { status, data: data as unknown as Prisma.InputJsonValue, source: 'Géorisques', sourceUrl: GEORISQUES_URL, confidence });
      return { outcome: { type, status }, retry: true };
    }
    await upsertBlock(db, orgId, terrain.id, type, {
      status,
      data: data as unknown as Prisma.InputJsonValue,
      source: 'Géorisques',
      sourceUrl: GEORISQUES_URL,
      confidence,
    });
    return { outcome: { type, status }, retry: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erreur inconnue';
    await upsertBlock(db, orgId, terrain.id, type, { status: 'ERROR', source: 'Géorisques', sourceUrl: GEORISQUES_URL, error: message }).catch(() => undefined);
    return { outcome: { type, status: 'ERROR' }, retry: true };
  }
}

/** Sections DVF (commune INSEE + préfixe/section) déduites des IDU des parcelles. */
function dvfSections(terrain: TerrainWithParcelles): DvfSection[] {
  const out: DvfSection[] = [];
  for (const p of terrain.parcelles) {
    if (p.idu && p.idu.length >= 10) {
      out.push({ commune: p.idu.slice(0, 5), section: p.idu.slice(5, 10) });
    }
  }
  return out;
}

/** Bloc PRIX_DVF (comparables terrains). Ne throw pas : signale le besoin de réessai via `retry`. */
async function enrichPrixDvf(
  db: TenantDb,
  orgId: string,
  terrain: TerrainWithParcelles,
  force: boolean,
): Promise<BlockRun> {
  const type: EnrichmentType = 'PRIX_DVF';
  try {
    const { data, transientError } = await getPrixDvfCached(
      { codeInsee: terrain.inseeCode, sections: dvfSections(terrain) },
      { force },
    );
    const { status, confidence } = summarizePrixDvf(data);
    if (transientError) {
      if (status === 'UNAVAILABLE') {
        await upsertBlock(db, orgId, terrain.id, type, { status: 'ERROR', source: DVF_SOURCE, sourceUrl: DVF_SOURCE_URL, error: 'DVF injoignable' });
        return { outcome: { type, status: 'ERROR' }, retry: true };
      }
      // Panne partielle (une section injoignable) : estimation partielle conservée, mais on
      // relance pour compléter le secteur au prochain essai (ne pas figer une médiane tronquée).
      await upsertBlock(db, orgId, terrain.id, type, { status, data: data as unknown as Prisma.InputJsonValue, source: DVF_SOURCE, sourceUrl: DVF_SOURCE_URL, confidence });
      return { outcome: { type, status }, retry: true };
    }
    await upsertBlock(db, orgId, terrain.id, type, {
      status,
      data: data as unknown as Prisma.InputJsonValue,
      source: DVF_SOURCE,
      sourceUrl: DVF_SOURCE_URL,
      confidence,
    });
    return { outcome: { type, status }, retry: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erreur inconnue';
    await upsertBlock(db, orgId, terrain.id, type, { status: 'ERROR', source: DVF_SOURCE, sourceUrl: DVF_SOURCE_URL, error: message }).catch(() => undefined);
    return { outcome: { type, status: 'ERROR' }, retry: true };
  }
}

/** Bloc PENTE (RGE ALTI : altitude, pente, exposition). Ne throw pas : signale `retry`. */
async function enrichPente(
  db: TenantDb,
  orgId: string,
  terrain: TerrainWithParcelles,
  force: boolean,
): Promise<BlockRun> {
  const type: EnrichmentType = 'PENTE';
  try {
    let centroid: { lon: number; lat: number } | null = null;
    for (const p of terrain.parcelles) {
      centroid = centroidOf(p.geojson);
      if (centroid) break;
    }
    if (!centroid) {
      await upsertBlock(db, orgId, terrain.id, type, { status: 'UNAVAILABLE', source: PENTE_SOURCE, sourceUrl: PENTE_SOURCE_URL });
      return { outcome: { type, status: 'UNAVAILABLE' }, retry: false };
    }
    const { data, transientError } = await getPenteCached({ lon: centroid.lon, lat: centroid.lat }, { force });
    const { status, confidence } = summarizePente(data);
    if (transientError) {
      if (status === 'UNAVAILABLE') {
        await upsertBlock(db, orgId, terrain.id, type, { status: 'ERROR', source: PENTE_SOURCE, sourceUrl: PENTE_SOURCE_URL, error: 'RGE ALTI injoignable' });
        return { outcome: { type, status: 'ERROR' }, retry: true };
      }
      await upsertBlock(db, orgId, terrain.id, type, { status, data: data as unknown as Prisma.InputJsonValue, source: PENTE_SOURCE, sourceUrl: PENTE_SOURCE_URL, confidence });
      return { outcome: { type, status }, retry: true };
    }
    await upsertBlock(db, orgId, terrain.id, type, {
      status,
      data: data as unknown as Prisma.InputJsonValue,
      source: PENTE_SOURCE,
      sourceUrl: PENTE_SOURCE_URL,
      confidence,
    });
    return { outcome: { type, status }, retry: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erreur inconnue';
    await upsertBlock(db, orgId, terrain.id, type, { status: 'ERROR', source: PENTE_SOURCE, sourceUrl: PENTE_SOURCE_URL, error: message }).catch(() => undefined);
    return { outcome: { type, status: 'ERROR' }, retry: true };
  }
}

/**
 * Enrichit un terrain : lit le terrain (scopé tenant via forOrg), récupère et persiste chaque
 * bloc sourcé de façon indépendante (une panne d'une source ne bloque pas l'autre). Relance
 * (throw) en fin si au moins un bloc a subi une panne transitoire, pour que BullMQ rejoue.
 * En Tranche 2 : blocs RISQUES (Géorisques), PRIX_DVF (Etalab) et PENTE (RGE ALTI).
 */
export async function runEnrichTerrain(data: EnrichTerrainJobData): Promise<EnrichTerrainJobResult> {
  const { organizationId, terrainId, force } = data;
  const db = forOrg(organizationId);
  const terrain = (await db.terrain.findUnique({
    where: { id: terrainId },
    include: { parcelles: true },
  })) as unknown as TerrainWithParcelles | null;

  if (!terrain) {
    return { terrainId, blocks: [], at: new Date().toISOString() };
  }

  const runs: BlockRun[] = [
    await enrichRisques(db, organizationId, terrain, Boolean(force)),
    await enrichPrixDvf(db, organizationId, terrain, Boolean(force)),
    await enrichPente(db, organizationId, terrain, Boolean(force)),
  ];
  const result: EnrichTerrainJobResult = {
    terrainId,
    blocks: runs.map((r) => r.outcome),
    at: new Date().toISOString(),
  };
  if (runs.some((r) => r.retry)) {
    // Au moins un bloc a subi une panne transitoire : on relance pour rejeu BullMQ (les blocs
    // OK sont idempotents et se rechargeront du cache). L'état de chaque bloc est déjà persisté.
    throw new Error(`Enrichissement partiellement injoignable, réessai programmé (terrain ${terrainId})`);
  }
  return result;
}
