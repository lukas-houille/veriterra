import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  getRedisConnection,
  type EnrichTerrainJobData,
  type PingJobData,
} from '@veriterra/shared';

// Module-singleton producer queues (do not construct per request).
let pingQueue: Queue<PingJobData> | undefined;
let enrichTerrainQueue: Queue<EnrichTerrainJobData> | undefined;

export function getPingQueue(): Queue<PingJobData> {
  if (!pingQueue) {
    pingQueue = new Queue<PingJobData>(QUEUE_NAMES.PING, { connection: getRedisConnection() });
  }
  return pingQueue;
}

export function getEnrichTerrainQueue(): Queue<EnrichTerrainJobData> {
  if (!enrichTerrainQueue) {
    enrichTerrainQueue = new Queue<EnrichTerrainJobData>(QUEUE_NAMES.ENRICH_TERRAIN, {
      connection: getRedisConnection(),
      // Fiabilité : réessais avec backoff exponentiel (les sources publiques peuvent flancher),
      // et purge bornée pour ne pas laisser gonfler Redis.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return enrichTerrainQueue;
}
