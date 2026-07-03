import { getRedisConnection } from '@veriterra/shared';

// Limite de débit best-effort par organisation (Redis INCR sur une fenêtre glissante grossière).
// Partagée par les endpoints COÛTEUX (proxies géo, enrichissement, upload) pour empêcher
// l'amplification / le déni de service par un tenant (source externe martelée, file de jobs saturée,
// mémoire épuisée). N'échoue jamais : si Redis est indisponible, on laisse passer (best-effort, on ne
// bloque pas une action légitime sur une panne de cache ; les bornes par requête restent assurées
// ailleurs, ex. taille d'upload).

/** Limite par défaut : requêtes par fenêtre et par organisation (endpoints géo légers). */
export const DEFAULT_RATE_LIMIT = 40;
/** Fenêtre de comptage (secondes). */
export const RATE_WINDOW_S = 60;

/**
 * True si l'organisation est SOUS la limite (`limit` requêtes par `RATE_WINDOW_S`) pour l'action
 * `name`. Chaque action a sa propre clé et peut fixer une limite plus stricte que le défaut (ex.
 * l'enrichissement, bien plus coûteux qu'un proxy géo). Best-effort : Redis indisponible => true.
 */
export async function withinOrgRateLimit(
  orgId: string,
  name: string,
  limit: number = DEFAULT_RATE_LIMIT,
): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const key = `rl:${name}:${orgId}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, RATE_WINDOW_S);
    return n <= limit;
  } catch {
    return true;
  }
}
