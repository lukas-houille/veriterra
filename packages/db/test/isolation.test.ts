import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, prisma } from '../src/client';
import { forOrg } from '../src/rls';
import {
  DOCUMENT_A_ID,
  DOCUMENT_B_ID,
  ENRICHMENT_A_ID,
  ENRICHMENT_B_ID,
  INVITATION_A_ID,
  INVITATION_B_ID,
  ORG_A_ID,
  ORG_B_ID,
  PROJET_B_ID,
  SCORE_OVERRIDE_A_ID,
  SCORE_OVERRIDE_B_ID,
  TERRAIN_A_ID,
  TERRAIN_B_ID,
  USER_A_ID,
  USER_B_ID,
  seed,
} from '../prisma/seed-data';

// The hard invariant (US-0.2): tenant isolation is enforced by Postgres RLS, exercised
// here through the RESTRICTED app role (`forOrg` uses the `veriterra_app` connection). The
// negative control proves it is the policy — not application code — doing the filtering.

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), admin.$disconnect()]);
});

describe('RLS tenant isolation', () => {
  it("org B sees only its own memberships", async () => {
    const db = forOrg(ORG_B_ID);
    const memberships = await db.membership.findMany();
    expect(memberships).toHaveLength(1);
    expect(memberships.every((m) => m.organisationId === ORG_B_ID)).toBe(true);
  });

  it('org B sees only its own organisation', async () => {
    const db = forOrg(ORG_B_ID);
    const orgs = await db.organisation.findMany();
    expect(orgs.map((o) => o.id)).toEqual([ORG_B_ID]);
  });

  it("org B cannot read org A's organisation by id", async () => {
    const db = forOrg(ORG_B_ID);
    const orgA = await db.organisation.findUnique({ where: { id: ORG_A_ID } });
    expect(orgA).toBeNull();
  });

  it('org B sees only users who are members of org B (User RLS via Membership)', async () => {
    const db = forOrg(ORG_B_ID);
    const ids = (await db.user.findMany()).map((u) => u.id);
    expect(ids).toContain(USER_B_ID);
    expect(ids).not.toContain(USER_A_ID);
  });

  it("WITH CHECK blocks writing a row stamped with another org", async () => {
    const db = forOrg(ORG_B_ID);
    await expect(
      db.membership.create({
        data: { userId: USER_B_ID, organisationId: ORG_A_ID, role: 'MEMBER' },
      }),
    ).rejects.toThrow();
  });

  it('org B sees only its own terrains (Terrain RLS)', async () => {
    const db = forOrg(ORG_B_ID);
    const terrains = await db.terrain.findMany();
    expect(terrains.map((t) => t.id)).toEqual([TERRAIN_B_ID]);
  });

  it("org B cannot read org A's terrain by id", async () => {
    const db = forOrg(ORG_B_ID);
    const t = await db.terrain.findUnique({ where: { id: TERRAIN_A_ID } });
    expect(t).toBeNull();
  });

  it('org B sees only its own parcelles (TerrainParcelle RLS)', async () => {
    const db = forOrg(ORG_B_ID);
    const parcelles = await db.terrainParcelle.findMany();
    expect(parcelles).toHaveLength(1);
    expect(parcelles.every((p) => p.organisationId === ORG_B_ID)).toBe(true);
  });

  it('WITH CHECK blocks creating a terrain stamped with another org', async () => {
    const db = forOrg(ORG_B_ID);
    await expect(
      db.terrain.create({
        data: { organisationId: ORG_A_ID, label: 'x', address: 'x', inseeCode: '00000' },
      }),
    ).rejects.toThrow();
  });

  it('org B sees only its own projet (Projet RLS)', async () => {
    const db = forOrg(ORG_B_ID);
    const projets = await db.projet.findMany();
    expect(projets.map((p) => p.id)).toEqual([PROJET_B_ID]);
  });

  it('org B sees only its own enrichment blocks (EnrichmentBlock RLS)', async () => {
    const db = forOrg(ORG_B_ID);
    const blocks = await db.enrichmentBlock.findMany();
    expect(blocks.map((b) => b.id)).toEqual([ENRICHMENT_B_ID]);
  });

  it("org B cannot read org A's enrichment block by id", async () => {
    const db = forOrg(ORG_B_ID);
    const block = await db.enrichmentBlock.findUnique({ where: { id: ENRICHMENT_A_ID } });
    expect(block).toBeNull();
  });

  it('WITH CHECK blocks creating an enrichment block stamped with another org', async () => {
    const db = forOrg(ORG_B_ID);
    await expect(
      db.enrichmentBlock.create({
        data: { organisationId: ORG_A_ID, terrainId: TERRAIN_A_ID, type: 'PLU' },
      }),
    ).rejects.toThrow();
  });

  it('org B sees only its own score overrides (TerrainScoreOverride RLS)', async () => {
    const db = forOrg(ORG_B_ID);
    const overrides = await db.terrainScoreOverride.findMany();
    expect(overrides.map((o) => o.id)).toEqual([SCORE_OVERRIDE_B_ID]);
  });

  it("org B cannot read org A's score override by id", async () => {
    const db = forOrg(ORG_B_ID);
    const ov = await db.terrainScoreOverride.findUnique({ where: { id: SCORE_OVERRIDE_A_ID } });
    expect(ov).toBeNull();
  });

  it('WITH CHECK blocks creating a score override stamped with another org', async () => {
    const db = forOrg(ORG_B_ID);
    await expect(
      db.terrainScoreOverride.create({
        data: { organisationId: ORG_A_ID, terrainId: TERRAIN_A_ID, criterion: 'prix', overrideScore: 50 },
      }),
    ).rejects.toThrow();
  });

  it('org B sees only its own documents (TerrainDocument RLS)', async () => {
    const db = forOrg(ORG_B_ID);
    const docs = await db.terrainDocument.findMany();
    expect(docs.map((d) => d.id)).toEqual([DOCUMENT_B_ID]);
  });

  it("org B cannot read org A's document by id", async () => {
    const db = forOrg(ORG_B_ID);
    const doc = await db.terrainDocument.findUnique({ where: { id: DOCUMENT_A_ID } });
    expect(doc).toBeNull();
  });

  it('WITH CHECK blocks creating a document stamped with another org', async () => {
    const db = forOrg(ORG_B_ID);
    await expect(
      db.terrainDocument.create({
        data: {
          organisationId: ORG_A_ID,
          terrainId: TERRAIN_A_ID,
          kind: 'DOCUMENT',
          filename: 'x.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1,
          storageKey: `org/${ORG_A_ID}/terrain/${TERRAIN_A_ID}/leak`,
        },
      }),
    ).rejects.toThrow();
  });

  it('org B sees only its own invitations (Invitation RLS)', async () => {
    const db = forOrg(ORG_B_ID);
    const invitations = await db.invitation.findMany();
    expect(invitations.map((i) => i.id)).toEqual([INVITATION_B_ID]);
  });

  it("org B cannot read org A's invitation by id", async () => {
    const db = forOrg(ORG_B_ID);
    const inv = await db.invitation.findUnique({ where: { id: INVITATION_A_ID } });
    expect(inv).toBeNull();
  });

  it('WITH CHECK blocks creating an invitation stamped with another org', async () => {
    const db = forOrg(ORG_B_ID);
    await expect(
      db.invitation.create({
        data: { organisationId: ORG_A_ID, email: 'leak@example.test', role: 'MEMBER' },
      }),
    ).rejects.toThrow();
  });

  it('fails closed: an unscoped query (no tenant context) returns nothing', async () => {
    // `prisma` without `forOrg` sets no GUC => current_setting is NULL => 0 rows.
    const rows = await prisma.membership.findMany();
    expect(rows).toHaveLength(0);
  });

  it('negative control: the privileged admin client sees BOTH orgs', async () => {
    const all = await admin.membership.findMany();
    const orgIds = new Set(all.map((m) => m.organisationId));
    expect(orgIds.has(ORG_A_ID)).toBe(true);
    expect(orgIds.has(ORG_B_ID)).toBe(true);
  });

  // Guard for Tranche 1+: any new table carrying `organisationId` must have RLS enabled
  // AND forced, or the restricted role (which inherits DML via default privileges) would
  // read it across tenants. This fails loudly the moment such a table ships without RLS.
  it('every table with an organisationId column has RLS enabled and forced', async () => {
    const rows = await admin.$queryRaw<
      Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'organisationId'
        )
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname}: RLS enabled`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname}: RLS forced`).toBe(true);
    }
  });
});
