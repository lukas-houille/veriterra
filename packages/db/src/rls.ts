import { prisma } from './client.js';

/**
 * Returns a Prisma client whose every operation runs inside a transaction that first
 * sets the tenant GUC `app.current_org_id` with `set_config(..., true)` (LOCAL, so it
 * is scoped to that transaction and cannot leak to another request on a pooled
 * connection). The RLS policies key on this GUC, so the database — not application
 * code — enforces tenant isolation. A forgotten `where` clause leaks nothing.
 *
 * Use this for ALL request-scoped tenant data, passing the `organisationId` from the
 * Auth.js session.
 */
export function forOrg(organisationId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_org_id', ${organisationId}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

/**
 * Interactive-transaction variant for multi-statement units of work (several writes
 * that must share one tenant context). Prefer this over chaining `forOrg()` calls when
 * you need more than a single operation, since the `forOrg()` extension wraps each
 * operation in its own transaction.
 */
export function withOrg<T>(
  organisationId: string,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organisationId}, true)`;
    return fn(tx);
  });
}
