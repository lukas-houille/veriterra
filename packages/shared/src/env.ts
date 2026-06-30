import { z } from 'zod';

/**
 * Runtime environment shared by the app and the worker.
 *
 * - `DATABASE_URL` connects as the restricted application role (`veriterra_app`):
 *   NOT superuser, NOT BYPASSRLS, NOT the table owner. RLS therefore constrains it.
 * - `DIRECT_URL` connects as the privileged owner/migration role and is used ONLY by
 *   `prisma migrate deploy` / seed. The app and worker never use it at runtime.
 *
 * Secrets come exclusively from the environment, never from the repository.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validate and return the server environment. Throws a readable error listing the
 * offending variables rather than failing deep inside a client at first query.
 */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid server environment: ${JSON.stringify(fields)}`);
  }
  return parsed.data;
}
