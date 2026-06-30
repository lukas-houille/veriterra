import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { admin } from '@veriterra/db';
import { bootstrapUserOrganisation } from '../src/lib/bootstrap';

// US-0.2 (one user = one org): first login creates exactly one organisation + OWNER
// membership, and is idempotent on subsequent logins.

const SUB = 'test-oidc-sub-bootstrap';

async function cleanup(): Promise<void> {
  const user = await admin.user.findUnique({ where: { oidcSubject: SUB } });
  if (!user) return;
  const memberships = await admin.membership.findMany({ where: { userId: user.id } });
  for (const m of memberships) {
    await admin.organisation.delete({ where: { id: m.organisationId } }).catch(() => undefined);
  }
  await admin.user.delete({ where: { id: user.id } }).catch(() => undefined);
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await admin.$disconnect();
});

describe('first-login bootstrap', () => {
  it('creates exactly one organisation + OWNER membership on first login', async () => {
    const ctx = await bootstrapUserOrganisation({ sub: SUB, email: 'x@test.example', name: 'X' });
    expect(ctx.role).toBe('OWNER');

    const user = await admin.user.findUniqueOrThrow({ where: { oidcSubject: SUB } });
    const memberships = await admin.membership.findMany({ where: { userId: user.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.organisationId).toBe(ctx.orgId);
  });

  it('is idempotent: a second login does not create a second organisation', async () => {
    const first = await bootstrapUserOrganisation({ sub: SUB, email: 'x@test.example', name: 'X' });
    const second = await bootstrapUserOrganisation({ sub: SUB, email: 'x2@test.example', name: 'X2' });
    expect(second.orgId).toBe(first.orgId);

    const user = await admin.user.findUniqueOrThrow({ where: { oidcSubject: SUB } });
    const memberships = await admin.membership.findMany({ where: { userId: user.id } });
    expect(memberships).toHaveLength(1);
  });
});
