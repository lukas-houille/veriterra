import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 CLI config. `migrate`/`db seed` connect via `datasource.url`, which we point
 * at `DIRECT_URL` — the privileged owner/migration role (it must CREATE EXTENSION, the
 * restricted app role, and RLS policies). The application runtime instead uses the
 * driver adapter with `DATABASE_URL` (restricted role); see `src/client.ts`.
 *
 * Env vars are injected by the caller (dotenv-cli at the repo root for local dev, the
 * job env in CI, env_file per service in docker-compose), so we read process.env here.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL as string,
  },
});
