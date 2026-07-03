import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { admin } from '@veriterra/db';
import {
  changeMemberRole,
  getOrgOverview,
  inviteMember,
  OrgManageError,
  removeMember,
  revokeInvitation,
} from '@/modules/organisation/service';

// Gestion des membres/invitations (inv-1) : invariants métier (dernier propriétaire, anti-escalade)
// via les clients scopés RLS, contre la base de dev réelle (comme bootstrap.test / terrains-service).

const ORG_ID = '00000000-0000-0000-0000-0000000000e0';
const OWNER_ID = '00000000-0000-0000-0000-0000000000e1';
const MEMBER_ID = '00000000-0000-0000-0000-0000000000e2';
const ADMIN_ID = '00000000-0000-0000-0000-0000000000e3';
const OWNER_EMAIL = 'owner-e@test.example';
const MEMBER_EMAIL = 'member-e@test.example';

async function reseed(): Promise<void> {
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  for (const id of [OWNER_ID, MEMBER_ID, ADMIN_ID]) {
    await admin.user.delete({ where: { id } }).catch(() => undefined);
  }
  await admin.organisation.create({ data: { id: ORG_ID, name: 'Org gestion test' } });
  await admin.user.create({ data: { id: OWNER_ID, oidcSubject: 'seed-owner-e', email: OWNER_EMAIL, name: 'Owner E' } });
  await admin.user.create({ data: { id: MEMBER_ID, oidcSubject: 'seed-member-e', email: MEMBER_EMAIL, name: 'Member E' } });
  await admin.user.create({ data: { id: ADMIN_ID, oidcSubject: 'seed-admin-e', email: 'admin-e@test.example', name: 'Admin E' } });
  await admin.membership.create({ data: { userId: OWNER_ID, organisationId: ORG_ID, role: 'OWNER' } });
  await admin.membership.create({ data: { userId: MEMBER_ID, organisationId: ORG_ID, role: 'MEMBER' } });
  await admin.membership.create({ data: { userId: ADMIN_ID, organisationId: ORG_ID, role: 'ADMIN' } });
}

async function teardown(): Promise<void> {
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  for (const id of [OWNER_ID, MEMBER_ID, ADMIN_ID]) {
    await admin.user.delete({ where: { id } }).catch(() => undefined);
  }
}

beforeEach(reseed);
afterAll(async () => {
  await teardown();
  await admin.$disconnect();
});

describe('inviteMember / revokeInvitation', () => {
  it('crée une invitation en attente, listée dans l\'aperçu', async () => {
    await inviteMember(ORG_ID, OWNER_ID, 'Nouveau@Exemple.fr', 'MEMBER');
    const overview = await getOrgOverview(ORG_ID, true);
    const inv = overview?.invitations.find((i) => i.email === 'nouveau@exemple.fr');
    expect(inv).toBeDefined();
    expect(inv?.role).toBe('MEMBER');
  });

  it('refuse d\'inviter une personne déjà membre (409)', async () => {
    await expect(inviteMember(ORG_ID, OWNER_ID, MEMBER_EMAIL, 'MEMBER')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuse un rôle OWNER à l\'invitation', async () => {
    await expect(inviteMember(ORG_ID, OWNER_ID, 'x@exemple.fr', 'OWNER' as 'MEMBER')).rejects.toBeInstanceOf(
      OrgManageError,
    );
  });

  it('révoque une invitation : elle disparaît de l\'aperçu', async () => {
    const inv = await inviteMember(ORG_ID, OWNER_ID, 'revoke@exemple.fr', 'MEMBER');
    await revokeInvitation(ORG_ID, inv.id);
    const overview = await getOrgOverview(ORG_ID, true);
    expect(overview?.invitations.some((i) => i.id === inv.id)).toBe(false);
  });
});

describe('changeMemberRole / removeMember (invariants)', () => {
  it('un OWNER promeut un MEMBER en ADMIN', async () => {
    await changeMemberRole(ORG_ID, 'OWNER', MEMBER_ID, 'ADMIN');
    const overview = await getOrgOverview(ORG_ID, true);
    expect(overview?.members.find((m) => m.userId === MEMBER_ID)?.role).toBe('ADMIN');
  });

  it('interdit de rétrograder le dernier propriétaire', async () => {
    await expect(changeMemberRole(ORG_ID, 'OWNER', OWNER_ID, 'ADMIN')).rejects.toMatchObject({ status: 409 });
    const overview = await getOrgOverview(ORG_ID, true);
    expect(overview?.members.find((m) => m.userId === OWNER_ID)?.role).toBe('OWNER');
  });

  it('interdit de retirer le dernier propriétaire', async () => {
    await expect(removeMember(ORG_ID, 'OWNER', OWNER_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('un ADMIN ne peut pas promouvoir en OWNER (anti-escalade, 403)', async () => {
    await expect(changeMemberRole(ORG_ID, 'ADMIN', MEMBER_ID, 'OWNER')).rejects.toMatchObject({ status: 403 });
  });

  it('un ADMIN ne peut pas retirer un OWNER (403)', async () => {
    await expect(removeMember(ORG_ID, 'ADMIN', OWNER_ID)).rejects.toMatchObject({ status: 403 });
  });

  it('retire un membre simple', async () => {
    await removeMember(ORG_ID, 'OWNER', MEMBER_ID);
    const overview = await getOrgOverview(ORG_ID, true);
    expect(overview?.members.some((m) => m.userId === MEMBER_ID)).toBe(false);
  });

  it('un second OWNER permet de rétrograder le premier', async () => {
    await changeMemberRole(ORG_ID, 'OWNER', ADMIN_ID, 'OWNER');
    await changeMemberRole(ORG_ID, 'OWNER', OWNER_ID, 'ADMIN');
    const overview = await getOrgOverview(ORG_ID, true);
    expect(overview?.members.find((m) => m.userId === OWNER_ID)?.role).toBe('ADMIN');
  });
});
