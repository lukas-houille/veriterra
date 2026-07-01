import { forOrg, Prisma } from '@veriterra/db';
import type {
  EnrichBlockOutcome,
  EnrichTerrainJobData,
  EnrichTerrainJobResult,
} from '@veriterra/shared';
import { getRisquesGeorisquesCached, summarizeRisques } from '@veriterra/enrichment';

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
  parcelles: Array<{ geojson: unknown }>;
};

/**
 * Bloc RISQUES (Géorisques) : récupère, synthétise et upsert. Une panne transitoire totale
 * (source injoignable) écrit un bloc ERROR et RELANCE pour que BullMQ rejoue avec backoff, au
 * lieu de figer un faux "aucun risque" terminal. Une vraie absence de couverture reste un
 * UNAVAILABLE terminal légitime. Les erreurs DB se propagent aussi (réessai).
 */
async function enrichRisques(
  db: TenantDb,
  organisationId: string,
  terrain: TerrainWithParcelles,
  force: boolean,
): Promise<EnrichBlockOutcome> {
  const type = 'RISQUES' as const;

  let centroid: { lon: number; lat: number } | null = null;
  for (const p of terrain.parcelles) {
    centroid = centroidOf(p.geojson);
    if (centroid) break;
  }
  if (!centroid) {
    await db.enrichmentBlock.upsert({
      where: { terrainId_type: { terrainId: terrain.id, type } },
      create: { organisationId, terrainId: terrain.id, type, status: 'UNAVAILABLE', source: 'Géorisques', sourceUrl: GEORISQUES_URL },
      update: { status: 'UNAVAILABLE', data: Prisma.DbNull, error: null, fetchedAt: new Date() },
    });
    return { type, status: 'UNAVAILABLE' };
  }

  const { data, transientError } = await getRisquesGeorisquesCached(
    { lon: centroid.lon, lat: centroid.lat, codeInsee: terrain.inseeCode },
    { force },
  );
  const { status, confidence } = summarizeRisques(data);

  if (status === 'UNAVAILABLE' && transientError) {
    const message = 'Géorisques injoignable';
    await db.enrichmentBlock
      .upsert({
        where: { terrainId_type: { terrainId: terrain.id, type } },
        create: { organisationId, terrainId: terrain.id, type, status: 'ERROR', source: 'Géorisques', sourceUrl: GEORISQUES_URL, error: message },
        update: { status: 'ERROR', error: message, fetchedAt: new Date() },
      })
      .catch(() => undefined);
    throw new Error(`${message}, réessai programmé (terrain ${terrain.id})`);
  }

  const payload = data as unknown as Prisma.InputJsonValue;
  await db.enrichmentBlock.upsert({
    where: { terrainId_type: { terrainId: terrain.id, type } },
    create: {
      organisationId,
      terrainId: terrain.id,
      type,
      status,
      data: payload,
      source: 'Géorisques',
      sourceUrl: GEORISQUES_URL,
      confidence,
      fetchedAt: new Date(),
    },
    update: {
      status,
      data: payload,
      source: 'Géorisques',
      sourceUrl: GEORISQUES_URL,
      confidence,
      fetchedAt: new Date(),
      error: null,
    },
  });
  return { type, status };
}

/**
 * Enrichit un terrain : lit le terrain (scopé tenant via forOrg), calcule un point
 * représentatif, récupère et persiste les blocs sourcés. En Tranche 2 slice 1 : bloc RISQUES.
 * Relance (throw) sur panne transitoire de source ou erreur DB, pour laisser BullMQ rejouer.
 */
export async function runEnrichTerrain(data: EnrichTerrainJobData): Promise<EnrichTerrainJobResult> {
  const { organizationId, terrainId, force } = data;
  const db = forOrg(organizationId);
  const terrain = (await db.terrain.findUnique({
    where: { id: terrainId },
    include: { parcelles: true },
  })) as unknown as TerrainWithParcelles | null;

  const blocks: EnrichBlockOutcome[] = [];
  if (terrain) {
    blocks.push(await enrichRisques(db, organizationId, terrain, Boolean(force)));
  }
  return { terrainId, blocks, at: new Date().toISOString() };
}
