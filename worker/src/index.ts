import { Worker } from 'bullmq';
import { forOrg } from '@veriterra/db';
import {
  QUEUE_NAMES,
  WORKER_HEARTBEAT_KEY,
  createRedisConnection,
  type PingJobData,
  type PingJobResult,
} from '@veriterra/shared';

const HEARTBEAT_TTL_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 10_000;
const SHUTDOWN_FORCE_MS = 25_000;

// A BullMQ Worker's connection runs in blocking mode, so the heartbeat needs its own.
const workerConnection = createRedisConnection();
const heartbeatConnection = createRedisConnection();

const worker = new Worker<PingJobData, PingJobResult>(
  QUEUE_NAMES.PING,
  async (job) => {
    // The worker has no Auth.js session, so it derives the tenant context from the job
    // payload. No DB work in the Tranche-0 no-op job, but we establish the pattern:
    // every future job scopes its DB access through `forOrg(job.data.organizationId)`.
    const db = forOrg(job.data.organizationId);
    void db;
    return { pong: job.data.echo, at: new Date().toISOString() };
  },
  { connection: workerConnection, concurrency: 5 },
);

worker.on('completed', (job) => console.log(`[worker] ping ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[worker] ping ${job?.id} failed:`, err));

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
worker.on('active', () => void beat());

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
    await worker.close(); // stops taking new jobs, waits for in-flight to finish
    await Promise.allSettled([workerConnection.quit(), heartbeatConnection.quit()]);
  } finally {
    clearTimeout(force);
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log('[worker] started, listening on queue:', QUEUE_NAMES.PING);
