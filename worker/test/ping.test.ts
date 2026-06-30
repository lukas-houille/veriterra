import { Queue, QueueEvents, Worker } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createRedisConnection,
  type PingJobData,
  type PingJobResult,
} from '@veriterra/shared';

// US-0.3 plumbing: prove the app -> Redis -> worker pipeline end to end against a real
// Redis. Uses an isolated queue name so it never collides with the running worker.

const QUEUE = 'ping-test';
const conns = [createRedisConnection(), createRedisConnection(), createRedisConnection()];
const [producerConn, workerConn, eventsConn] = conns;

afterAll(async () => {
  await Promise.all(conns.map((c) => c.quit()));
});

describe('ping pipeline', () => {
  it('processes a ping job and returns the echo', async () => {
    const queue = new Queue<PingJobData>(QUEUE, { connection: producerConn });
    const worker = new Worker<PingJobData, PingJobResult>(
      QUEUE,
      async (job) => ({ pong: job.data.echo, at: new Date().toISOString() }),
      { connection: workerConn },
    );
    const events = new QueueEvents(QUEUE, { connection: eventsConn });
    await events.waitUntilReady();

    const job = await queue.add('ping', {
      organizationId: '00000000-0000-0000-0000-0000000000bb',
      echo: 'hi',
    });
    const result = (await job.waitUntilFinished(events, 10_000)) as PingJobResult;

    expect(result.pong).toBe('hi');

    await worker.close();
    await events.close();
    await queue.close();
  });
});
