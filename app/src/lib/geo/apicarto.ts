import { getRedisConnection } from '@veriterra/shared';
import { fetchParcelleFromApiByIdu } from './apicarto-core';
import type { ParcelleData } from './types';

// Wrapper SERVEUR : cache Redis best-effort autour du cœur client-safe. Ne pas importer
// côté navigateur (dépend de Redis). Le cœur (parseIdu, normalize, fetch par point) vit
// dans apicarto-core.ts.
export {
  ParcelleNotFoundError,
  parseIdu,
  normalizeParcelleFeature,
  fetchParcelleFromApiByIdu,
  fetchParcelleAtPoint,
} from './apicarto-core';

const CACHE_PREFIX = 'geo:parcelle:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours (données cadastrales publiques)

/**
 * Récupère les données faisant autorité d'une parcelle par son IDU (IGN API Carto), avec
 * cache Redis best-effort (données publiques réutilisables). Appelé côté serveur à la
 * création d'un terrain : on ne fait jamais confiance à la géométrie envoyée par le client.
 */
export async function fetchParcelleByIdu(idu: string): Promise<ParcelleData> {
  const key = `${CACHE_PREFIX}${idu}`;
  try {
    const cached = await getRedisConnection().get(key);
    if (cached) return JSON.parse(cached) as ParcelleData;
  } catch {
    // cache indisponible : on poursuit sans.
  }
  const parcelle = await fetchParcelleFromApiByIdu(idu);
  try {
    await getRedisConnection().set(key, JSON.stringify(parcelle), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // écriture de cache best-effort.
  }
  return parcelle;
}
