/**
 * Single source of truth for the job-queue contract.
 *
 * The enqueuer (app) and the consumer (worker) both import these names and types, so an
 * `add()` whose payload does not match the processor's expected type is a compile error.
 *
 * Every job payload carries `organizationId`: the worker has no Auth.js session, so it
 * must set the Postgres RLS context (`app.current_org_id`) from the job itself.
 */
export const QUEUE_NAMES = {
  PING: 'ping',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Redis key the worker stamps on each heartbeat; read by the worker healthcheck. */
export const WORKER_HEARTBEAT_KEY = 'worker:ping:heartbeat';


/** Tranche-0 no-op job used to prove the app -> Redis -> worker pipeline end to end. */
export interface PingJobData {
  organizationId: string;
  echo: string;
}

export interface PingJobResult {
  pong: string;
  at: string;
}

/** Map each queue name to its payload type. */
export interface JobDataByQueue {
  [QUEUE_NAMES.PING]: PingJobData;
}
