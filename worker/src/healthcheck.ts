import { WORKER_HEARTBEAT_KEY, createRedisConnection } from '@veriterra/shared';

/**
 * Standalone liveness check executed by the Docker HEALTHCHECK (no HTTP server in the
 * worker image). The worker is healthy iff its heartbeat key was refreshed recently.
 */
const FRESH_MS = 30_000;

const connection = createRedisConnection();
try {
  const ts = await connection.get(WORKER_HEARTBEAT_KEY);
  const fresh = ts !== null && Date.now() - Number(ts) < FRESH_MS;
  process.exitCode = fresh ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  await connection.quit();
}
