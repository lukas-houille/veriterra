import { admin } from '../src/client';

/**
 * Deterministic seed for two tenants, reused by both `prisma db seed` and the RLS
 * isolation test. Runs through the privileged `admin` client (bypasses RLS) because it
 * deliberately writes across tenant boundaries. Idempotent via fixed UUIDs.
 */
export const ORG_A_ID = '00000000-0000-0000-0000-0000000000aa';
export const ORG_B_ID = '00000000-0000-0000-0000-0000000000bb';
export const USER_A_ID = '00000000-0000-0000-0000-0000000000a1';
export const USER_B_ID = '00000000-0000-0000-0000-0000000000b1';

export async function seed(): Promise<void> {
  await admin.organisation.upsert({
    where: { id: ORG_A_ID },
    update: { name: 'Org A' },
    create: { id: ORG_A_ID, name: 'Org A' },
  });
  await admin.organisation.upsert({
    where: { id: ORG_B_ID },
    update: { name: 'Org B' },
    create: { id: ORG_B_ID, name: 'Org B' },
  });

  await admin.user.upsert({
    where: { oidcSubject: 'seed-user-a' },
    update: { email: 'a@example.test', name: 'User A' },
    create: { id: USER_A_ID, oidcSubject: 'seed-user-a', email: 'a@example.test', name: 'User A' },
  });
  await admin.user.upsert({
    where: { oidcSubject: 'seed-user-b' },
    update: { email: 'b@example.test', name: 'User B' },
    create: { id: USER_B_ID, oidcSubject: 'seed-user-b', email: 'b@example.test', name: 'User B' },
  });

  await admin.membership.upsert({
    where: { userId_organisationId: { userId: USER_A_ID, organisationId: ORG_A_ID } },
    update: { role: 'OWNER' },
    create: { userId: USER_A_ID, organisationId: ORG_A_ID, role: 'OWNER' },
  });
  await admin.membership.upsert({
    where: { userId_organisationId: { userId: USER_B_ID, organisationId: ORG_B_ID } },
    update: { role: 'OWNER' },
    create: { userId: USER_B_ID, organisationId: ORG_B_ID, role: 'OWNER' },
  });
}
