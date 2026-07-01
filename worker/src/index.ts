import { Worker } from 'bullmq';
import { forOrg } from '@veriterra/db';
import {
  QUEUE_NAMES,
  WORKER_HEARTBEAT_KEY,
  createRedisConnection,
  type EnrichTerrainJobData,
  type EnrichTerrainJobResult,
  type PingJobData,
  type PingJobResult,
} from '@veriterra/shared';
import { runEnrichTerrain } from './enrich-terrain';

const HEARTBEAT_TTL_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 10_000;
const SHUTDOWN_FORCE_MS = 25_000;

// Chaque Worker BullMQ ouvre une connexion en mode bloquant : le heartbeat a la sienne.
const pingConnection = createRedisConnection();
const enrichConnection = createRedisConnection();
const heartbeatConnection = createRedisConnection();

const pingWorker = new Worker<PingJobData, PingJobResult>(
  QUEUE_NAMES.PING,
  async (job) => {
    // Pas de session Auth.js : le contexte tenant vient du payload. On établit le pattern,
    // chaque job scope son accès DB via `forOrg(job.data.organizationId)`.
    const db = forOrg(job.data.organizationId);
    void db;
    return { pong: job.data.echo, at: new Date().toISOString() };
  },
  { connection: pingConnection, concurrency: 5 },
);

// Enrichissement d'un terrain (Tranche 2) : récupère les sources publiques et écrit des blocs
// sourcés via `forOrg` (scoping tenant depuis le payload). Slice 1 : risques Géorisques.
const enrichWorker = new Worker<EnrichTerrainJobData, EnrichTerrainJobResult>(
  QUEUE_NAMES.ENRICH_TERRAIN,
  async (job) => {
    const result = await runEnrichTerrain(job.data);
    console.log(
      `[worker] enrichTerrain ${job.data.terrainId}:`,
      result.blocks.map((b) => `${b.type}=${b.status}`).join(', ') || 'aucun bloc',
    );
    return result;
  },
  { connection: enrichConnection, concurrency: 5 },
);

for (const [name, w] of [
  ['ping', pingWorker],
  ['enrichTerrain', enrichWorker],
] as const) {
  w.on('completed', (job) => console.log(`[worker] ${name} ${job.id} completed`));
  w.on('failed', (job, err) => console.error(`[worker] ${name} ${job?.id} failed:`, err));
}

async function beat(): Promise<void> {
  try {
    await heartbeatConnection.set(
      WORKER_HEARTBEAT_KEY,
      Date.now().toString(),
      'EX',
      HEARTBEAT_TTL_SECONDS,
    );
  } catch (err) {
    console.error('[worker] heartbeat failed:', err);
  }
}

const heartbeat = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
void beat();
pingWorker.on('active', () => void beat());
enrichWorker.on('active', () => void beat());

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}, draining...`);
  clearInterval(heartbeat);
  const force = setTimeout(() => {
    console.error('[worker] forced exit after timeout');
    process.exit(1);
  }, SHUTDOWN_FORCE_MS);
  try {
    await Promise.all([pingWorker.close(), enrichWorker.close()]);
    await Promise.allSettled([
      pingConnection.quit(),
      enrichConnection.quit(),
      heartbeatConnection.quit(),
    ]);
  } finally {
    clearTimeout(force);
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log('[worker] started, listening on queues:', QUEUE_NAMES.PING, QUEUE_NAMES.ENRICH_TERRAIN);
