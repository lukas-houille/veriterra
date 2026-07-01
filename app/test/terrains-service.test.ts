import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin } from '@veriterra/db';

// Enfilage mocké (pas de Redis dans ce test) et récupération parcellaire mockée
// (pas d'appel réseau à API Carto) : on teste la persistance + la géométrie + le scoping.
vi.mock('@/lib/queues', () => ({
  getEnrichTerrainQueue: () => ({ add: vi.fn(async () => ({ id: 'job-1' })) }),
}));
vi.mock('@/lib/geo/apicarto', () => ({
  fetchParcelleByIdu: vi.fn(async (idu: string) => ({
    idu,
    commune: 'Lyon',
    section: 'AA',
    numero: idu.slice(-4),
    surfaceM2: idu.endsWith('0001') ? 500 : 300,
    geojson: {
      type: 'Polygon',
      coordinates: [
        [
          [4.83, 45.75],
          [4.831, 45.75],
          [4.831, 45.751],
          [4.83, 45.751],
          [4.83, 45.75],
        ],
      ],
    },
    source: 'mock',
    fetchedAt: new Date().toISOString(),
  })),
}));

import { createTerrain, getTerrain, listTerrains } from '@/modules/terrains/service';

const ORG_ID = '00000000-0000-0000-0000-0000000000cc';

beforeAll(async () => {
  await admin.organisation.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: 'Org Terrain Test' },
  });
});

afterAll(async () => {
  // Cascade supprime terrains + parcelles.
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  await admin.$disconnect();
});

describe('createTerrain', () => {
  it('crée un terrain, agrège la surface, peuple la géométrie PostGIS, scopé au tenant', async () => {
    const summary = await createTerrain(ORG_ID, null, {
      address: '1 rue Test, Lyon',
      inseeCode: '69381',
      idus: ['69381000AA0001', '69381000AA0002'],
      prixDemande: 250000,
    });

    expect(summary.parcelles).toHaveLength(2);
    expect(summary.surfaceTotaleM2).toBe(800);
    expect(summary.prixDemande).toBe(250000);
    expect(summary.status).toBe('A_ETUDIER');

    // La colonne géométrie est bien peuplée en MultiPolygon (pipeline ST_GeomFromGeoJSON).
    const geoms = await admin.$queryRaw<Array<{ g: string | null }>>`
      SELECT ST_AsGeoJSON(geom) AS g FROM "TerrainParcelle" WHERE "terrainId" = ${summary.id}::uuid
    `;
    expect(geoms).toHaveLength(2);
    expect(geoms.every((r) => r.g?.includes('MultiPolygon'))).toBe(true);

    // Lisible via le bon tenant.
    const fetched = await getTerrain(ORG_ID, summary.id);
    expect(fetched?.id).toBe(summary.id);
    expect((await listTerrains(ORG_ID)).map((t) => t.id)).toContain(summary.id);
  });

  it('refuse une création sans parcelle', async () => {
    await expect(
      createTerrain(ORG_ID, null, { address: 'x', inseeCode: '69381', idus: [] }),
    ).rejects.toThrow();
  });
});
