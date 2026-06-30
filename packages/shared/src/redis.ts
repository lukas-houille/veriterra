import IORedis from 'ioredis';

/**
 * Create a fresh Redis connection. `maxRetriesPerRequest: null` is REQUIRED by BullMQ
 * for its blocking commands. Use a dedicated connection for a BullMQ Worker (its
 * connection runs in blocking mode and cannot service other commands concurrently),
 * and separate ones for unrelated commands such as the worker heartbeat.
 */
export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/**
 * Shared singleton connection for non-blocking producers (e.g. the app enqueuing jobs).
 * Next.js (App Router) can re-import modules across server invocations, so we must NOT
 * create a new connection per request or we exhaust Redis.
 */
let connection: IORedis | undefined;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}
