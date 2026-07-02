import { getRedisConnection } from '@veriterra/shared';
import { fetchRisquesGeorisques, type GeorisquesInput, type RisquesFetchResult } from './georisques';
import { fetchPrixDvf, type DvfInput, type PrixDvfFetchResult } from './dvf';
import type { PrixDvfData, RisquesData } from './types';

// Cache Redis best-effort autour des sources publiques (données réutilisables entre terrains
// d'une même zone). Calqué sur app/src/lib/geo/apicarto.ts : préfixe à deux points, TTL long,
// try/catch autour de get ET set (Redis non critique). Server-only (dépend de Redis) : importé
// par le worker, pas par le navigateur.

const PREFIX = 'enrich:georisques:';
const DVF_PREFIX = 'enrich:dvf:';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours (données publiques peu volatiles)

function cacheKey(input: GeorisquesInput): string {
  // Arrondi ~11 m pour mutualiser entre parcelles proches, plus le code INSEE (radon).
  return `${PREFIX}${input.lat.toFixed(4)},${input.lon.toFixed(4)},${input.codeInsee}`;
}

function dvfCacheKey(input: DvfInput): string {
  const sections = input.sections.map((s) => `${s.commune}/${s.section}`).sort().join(',');
  return `${DVF_PREFIX}${input.codeInsee}:${sections}`;
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

/**
 * Prix DVF avec cache Redis (mêmes garanties que les risques : `force` contourne, un résultat
 * affecté par une panne transitoire n'est pas mis en cache).
 */
export async function getPrixDvfCached(
  input: DvfInput,
  opts: { force?: boolean } = {},
): Promise<PrixDvfFetchResult> {
  const key = dvfCacheKey(input);
  if (!opts.force) {
    try {
      const cached = await getRedisConnection().get(key);
      if (cached) return { data: JSON.parse(cached) as PrixDvfData, transientError: false };
    } catch {
      // cache indisponible : on poursuit sans.
    }
  }
  const result = await fetchPrixDvf(input);
  if (!result.transientError) {
    try {
      await getRedisConnection().set(key, JSON.stringify(result.data), 'EX', TTL_SECONDS);
    } catch {
      // écriture best-effort.
    }
  }
  return result;
}
