import { Queue } from 'bullmq';
import { QUEUE_NAMES, getRedisConnection, type PingJobData } from '@veriterra/shared';

// Module-singleton producer queue (do not construct per request).
let pingQueue: Queue<PingJobData> | undefined;

export function getPingQueue(): Queue<PingJobData> {
  if (!pingQueue) {
    pingQueue = new Queue<PingJobData>(QUEUE_NAMES.PING, { connection: getRedisConnection() });
  }
  return pingQueue;
}
