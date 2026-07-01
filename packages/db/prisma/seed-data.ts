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
export const TERRAIN_A_ID = '00000000-0000-0000-0000-0000000000a2';
export const TERRAIN_B_ID = '00000000-0000-0000-0000-0000000000b2';
export const PARCELLE_A_ID = '00000000-0000-0000-0000-0000000000a3';
export const PARCELLE_B_ID = '00000000-0000-0000-0000-0000000000b3';
export const PROJET_A_ID = '00000000-0000-0000-0000-0000000000a4';
export const PROJET_B_ID = '00000000-0000-0000-0000-0000000000b4';
export const ENRICHMENT_A_ID = '00000000-0000-0000-0000-0000000000a5';
export const ENRICHMENT_B_ID = '00000000-0000-0000-0000-0000000000b5';

// Petits carrés GeoJSON (WGS84) autour de Lyon, un par tenant.
const POLY_A = {
  type: 'Polygon',
  coordinates: [[[4.83, 45.75], [4.831, 45.75], [4.831, 45.751], [4.83, 45.751], [4.83, 45.75]]],
};
const POLY_B = {
  type: 'Polygon',
  coordinates: [[[4.84, 45.76], [4.841, 45.76], [4.841, 45.761], [4.84, 45.761], [4.84, 45.76]]],
};

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

  // Terrains + parcelles (Tranche 1), un par tenant, pour les tests d'isolation.
  await admin.terrain.upsert({
    where: { id: TERRAIN_A_ID },
    update: {},
    create: {
      id: TERRAIN_A_ID,
      organisationId: ORG_A_ID,
      label: 'Terrain A',
      address: '1 rue A, Lyon',
      inseeCode: '69381',
    },
  });
  await admin.terrain.upsert({
    where: { id: TERRAIN_B_ID },
    update: {},
    create: {
      id: TERRAIN_B_ID,
      organisationId: ORG_B_ID,
      label: 'Terrain B',
      address: '2 rue B, Lyon',
      inseeCode: '69382',
    },
  });

  await admin.terrainParcelle.upsert({
    where: { id: PARCELLE_A_ID },
    update: {},
    create: {
      id: PARCELLE_A_ID,
      organisationId: ORG_A_ID,
      terrainId: TERRAIN_A_ID,
      idu: '69381000AA0001',
      commune: 'Lyon',
      section: 'AA',
      numero: '0001',
      surfaceM2: 500,
      geojson: POLY_A,
      source: 'seed',
    },
  });
  await admin.terrainParcelle.upsert({
    where: { id: PARCELLE_B_ID },
    update: {},
    create: {
      id: PARCELLE_B_ID,
      organisationId: ORG_B_ID,
      terrainId: TERRAIN_B_ID,
      idu: '69382000BB0001',
      commune: 'Lyon',
      section: 'BB',
      numero: '0001',
      surfaceM2: 700,
      geojson: POLY_B,
      source: 'seed',
    },
  });

  // Peuple la colonne géométrie PostGIS depuis le GeoJSON (ST_Multi pour coller au type
  // MultiPolygon, ST_SetSRID pour garantir le SRID 4326 de la colonne). Idempotent.
  await admin.$executeRaw`
    UPDATE "TerrainParcelle"
    SET geom = ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(geojson::text)), 4326)
    WHERE id IN (${PARCELLE_A_ID}::uuid, ${PARCELLE_B_ID}::uuid) AND geom IS NULL
  `;

  // Projets (Tranche 1), un par tenant, pour les tests d'isolation.
  await admin.projet.upsert({
    where: { id: PROJET_A_ID },
    update: {},
    create: {
      id: PROJET_A_ID,
      organisationId: ORG_A_ID,
      name: 'Projet A',
      budgetMax: 200000,
      surfaceMinM2: 400,
      surfaceMaxM2: 800,
    },
  });
  await admin.projet.upsert({
    where: { id: PROJET_B_ID },
    update: {},
    create: { id: PROJET_B_ID, organisationId: ORG_B_ID, name: 'Projet B' },
  });

  // Blocs d'enrichissement (Tranche 2), un par tenant, pour les tests d'isolation.
  await admin.enrichmentBlock.upsert({
    where: { id: ENRICHMENT_A_ID },
    update: {},
    create: {
      id: ENRICHMENT_A_ID,
      organisationId: ORG_A_ID,
      terrainId: TERRAIN_A_ID,
      type: 'RISQUES',
      status: 'OK',
      source: 'Géorisques',
      confidence: 'ELEVEE',
      data: { items: [] },
    },
  });
  await admin.enrichmentBlock.upsert({
    where: { id: ENRICHMENT_B_ID },
    update: {},
    create: {
      id: ENRICHMENT_B_ID,
      organisationId: ORG_B_ID,
      terrainId: TERRAIN_B_ID,
      type: 'RISQUES',
      status: 'OK',
      source: 'Géorisques',
      confidence: 'ELEVEE',
      data: { items: [] },
    },
  });
}
