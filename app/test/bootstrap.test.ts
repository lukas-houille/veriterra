import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { admin } from '@veriterra/db';
import { bootstrapUserOrganisation, refreshTenantContext } from '../src/lib/bootstrap';

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

// Acceptation d'invitation au login (inv-1) : un invité (avant même d'avoir un compte) rejoint
// l'organisation d'invitation à sa première connexion, avec le rôle prévu, sans organisation personnelle.
const INV_SUB = 'test-oidc-sub-invitee';
const INV_EMAIL = 'invitee@test.example';

async function cleanupInvitee(): Promise<void> {
  const user = await admin.user.findUnique({ where: { oidcSubject: INV_SUB } });
  if (user) {
    const memberships = await admin.membership.findMany({ where: { userId: user.id } });
    for (const m of memberships) {
      // N'efface QUE les organisations personnelles éventuellement créées (jamais l'org d'invitation).
      const org = await admin.organisation.findUnique({ where: { id: m.organisationId } });
      if (org && org.name !== 'Org invitante test') {
        await admin.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
      }
    }
    await admin.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
  // Org invitante (et ses invitations, par cascade).
  const org = await admin.organisation.findFirst({ where: { name: 'Org invitante test' } });
  if (org) await admin.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
}

// Re-validation du contexte tenant à chaque requête (inv-1) : le rôle vivant est reflété et le retrait
// d'un membre prend effet sans re-login (sinon le JWT figé laisserait un accès/pouvoir périmé).
const RT_SUB = 'test-oidc-sub-refresh';

async function cleanupRefresh(): Promise<void> {
  const user = await admin.user.findUnique({ where: { oidcSubject: RT_SUB } });
  if (user) {
    const memberships = await admin.membership.findMany({ where: { userId: user.id } });
    for (const m of memberships) {
      await admin.organisation.delete({ where: { id: m.organisationId } }).catch(() => undefined);
    }
    await admin.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
  // Le test retire les adhésions puis laisse les organisations orphelines : on les nettoie par nom.
  for (const name of ['rt@test.example', 'Autre org RT']) {
    const orgs = await admin.organisation.findMany({ where: { name } });
    for (const o of orgs) await admin.organisation.delete({ where: { id: o.id } }).catch(() => undefined);
  }
}

describe('refreshTenantContext (révocation/rôle vivants)', () => {
  beforeEach(cleanupRefresh);
  afterAll(cleanupRefresh);

  it('reflète le rôle vivant et le retrait de l\'adhésion active', async () => {
    const ctx = await bootstrapUserOrganisation({ sub: RT_SUB, email: 'rt@test.example', name: 'RT' });
    const userId = ctx.userId;

    // Rôle vivant : une rétrogradation en base est reflétée sans re-login.
    await admin.membership.update({
      where: { userId_organisationId: { userId, organisationId: ctx.orgId } },
      data: { role: 'MEMBER' },
    });
    const afterDemote = await refreshTenantContext(userId, ctx.orgId);
    expect(afterDemote?.role).toBe('MEMBER');

    // Retrait de l'adhésion active + une autre org disponible => bascule sur l'autre.
    const other = await admin.organisation.create({ data: { name: 'Autre org RT' } });
    await admin.membership.create({ data: { userId, organisationId: other.id, role: 'ADMIN' } });
    await admin.membership.delete({ where: { userId_organisationId: { userId, organisationId: ctx.orgId } } });
    const afterRemove = await refreshTenantContext(userId, ctx.orgId);
    expect(afterRemove?.orgId).toBe(other.id);
    expect(afterRemove?.role).toBe('ADMIN');

    // Plus aucune adhésion => plus de contexte tenant (null).
    await admin.membership.delete({ where: { userId_organisationId: { userId, organisationId: other.id } } });
    expect(await refreshTenantContext(userId, ctx.orgId)).toBeNull();
  });
});

describe('invitation acceptance at login', () => {
  beforeEach(cleanupInvitee);
  afterAll(cleanupInvitee);

  it('accepts a pending invitation: joins the inviting org with its role, no personal org', async () => {
    const org = await admin.organisation.create({ data: { name: 'Org invitante test' } });
    const invitation = await admin.invitation.create({
      data: { organisationId: org.id, email: INV_EMAIL, role: 'ADMIN' },
    });

    // Connexion avec l'e-mail invité (casse mixte : le rattachement est insensible à la casse).
    const ctx = await bootstrapUserOrganisation({ sub: INV_SUB, email: 'Invitee@Test.Example', name: 'Invitee' });

    // Org active = org d'invitation, rôle = celui de l'invitation, pas d'org personnelle.
    expect(ctx.orgId).toBe(org.id);
    expect(ctx.role).toBe('ADMIN');
    const user = await admin.user.findUniqueOrThrow({ where: { oidcSubject: INV_SUB } });
    const memberships = await admin.membership.findMany({ where: { userId: user.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.organisationId).toBe(org.id);

    // Invitation marquée ACCEPTED, rattachée à l'utilisateur.
    const after = await admin.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(after.status).toBe('ACCEPTED');
    expect(after.acceptedByUserId).toBe(user.id);
    expect(after.acceptedAt).not.toBeNull();
  });
});
