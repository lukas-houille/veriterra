import { getRedisConnection } from '@veriterra/shared';
import { fetchRisquesGeorisques, type GeorisquesInput, type RisquesFetchResult } from './georisques';
import type { RisquesData } from './types';

// Cache Redis best-effort autour des sources publiques (données réutilisables entre terrains
// d'une même zone). Calqué sur app/src/lib/geo/apicarto.ts : préfixe à deux points, TTL long,
// try/catch autour de get ET set (Redis non critique). Server-only (dépend de Redis) : importé
// par le worker, pas par le navigateur.

const PREFIX = 'enrich:georisques:';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours (données publiques peu volatiles)

function cacheKey(input: GeorisquesInput): string {
  // Arrondi ~11 m pour mutualiser entre parcelles proches, plus le code INSEE (radon).
  return `${PREFIX}${input.lat.toFixed(4)},${input.lon.toFixed(4)},${input.codeInsee}`;
}

/**
 * Risques Géorisques avec cache Redis. `force` contourne le cache (rafraîchissement manuel).
 * On ne met PAS en cache un résultat affecté par une panne transitoire (transientError) : sinon
 * une indisponibilité passagère se figerait 30 jours et empoisonnerait toute la tuile voisine.
 * Ne throw jamais ; l'appelant décide (via transientError) de réessayer.
 */
export async function getRisquesGeorisquesCached(
  input: GeorisquesInput,
  opts: { force?: boolean } = {},
): Promise<RisquesFetchResult> {
  const key = cacheKey(input);
  if (!opts.force) {
    try {
      const cached = await getRedisConnection().get(key);
      if (cached) return { data: JSON.parse(cached) as RisquesData, transientError: false };
    } catch {
      // cache indisponible : on poursuit sans.
    }
  }
  const result = await fetchRisquesGeorisques(input);
  if (!result.transientError) {
    try {
      await getRedisConnection().set(key, JSON.stringify(result.data), 'EX', TTL_SECONDS);
    } catch {
      // écriture best-effort.
    }
  }
  return result;
}
