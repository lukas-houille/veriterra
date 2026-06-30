export { prisma, admin } from './client.js';
export { forOrg, withOrg } from './rls.js';
// Re-export the generated Prisma types (PrismaClient, Prisma namespace, Role enum,
// model types) so consumers import everything DB-related from `@veriterra/db`.
export * from '../generated/prisma/index.js';
