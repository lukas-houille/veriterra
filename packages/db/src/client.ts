import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/index.js';

/**
 * Two database clients, two privilege levels.
 *
 * - `prisma`  — connects via `DATABASE_URL` as the restricted role `veriterra_app`
 *               (NOT superuser, NOT BYPASSRLS, NOT table owner). Every query is
 *               constrained by Row-Level Security. Use it through `forOrg()` so the
 *               tenant context (`app.current_org_id`) is always set.
 * - `admin`   — connects via `DIRECT_URL` as the privileged owner/superuser role,
 *               which bypasses RLS. SERVER-ONLY and used ONLY for cross-tenant
 *               bootstrap work: the Auth.js first-login org creation, seeds, and the
 *               negative control in the isolation test. NEVER use it to serve
 *               request-scoped tenant data.
 */
function createClient(connectionString: string | undefined): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  __veriterraPrisma?: PrismaClient;
  __veriterraAdmin?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__veriterraPrisma ?? createClient(process.env.DATABASE_URL);

// Privileged client: ALWAYS the DIRECT_URL (owner) role. We do NOT fall back to
// DATABASE_URL — a silent downgrade to the restricted role would make cross-tenant
// bootstrap/seed fail under RLS in confusing ways. If DIRECT_URL is unset, admin queries
// fail loudly instead.
export const admin: PrismaClient =
  globalForPrisma.__veriterraAdmin ?? createClient(process.env.DIRECT_URL);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__veriterraPrisma = prisma;
  globalForPrisma.__veriterraAdmin = admin;
}
