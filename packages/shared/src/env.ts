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

/**
 * Object storage (MinIO / S3, self-hosted) used for terrain attachments. Optional: the app
 * boots without it and only fails (with a readable error) the moment an upload/download is
 * attempted while unconfigured, so non-storage tests and environments stay green. All values
 * are server-side secrets; they are never exposed to the browser.
 */
const storageEnvSchema = z.object({
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  // MinIO addresses buckets by path (endpoint/bucket/key), not virtual-host style.
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v !== 'false')
    .pipe(z.boolean()),
  // Taille maximale d'un fichier déposé (Mo). Bornée aussi côté route (défense en profondeur).
  S3_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  // Quota de stockage AGRÉGÉ par organisation (Mo) : borne l'espace total des pièces d'un tenant
  // pour éviter l'épuisement du stockage partagé (audit sécurité, finding LOW). 0 = illimité.
  S3_ORG_QUOTA_MB: z.coerce.number().int().nonnegative().default(5120),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

/**
 * Returns the object-storage config, or `null` when storage is not configured (the required
 * S3 variables are absent). Throws a readable error only when storage is partially configured
 * (some variables set, others missing) so a misconfiguration surfaces loudly instead of
 * silently disabling uploads.
 */
export function loadStorageEnv(source: NodeJS.ProcessEnv = process.env): StorageEnv | null {
  const required = [source.S3_ENDPOINT, source.S3_BUCKET, source.S3_ACCESS_KEY_ID, source.S3_SECRET_ACCESS_KEY];
  const anyPresent = required.some((v) => v != null && v !== '');
  if (!anyPresent) return null;

  const parsed = storageEnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid object-storage environment: ${JSON.stringify(fields)}`);
  }
  return parsed.data;
}
