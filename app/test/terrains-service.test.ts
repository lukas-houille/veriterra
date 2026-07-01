import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin } from '@veriterra/db';

// Enfilage mocké (pas de Redis dans ce test). La donnée parcellaire est fournie par le
// client (issue d'API Carto au clic) : le service la persiste, on teste persistance +
// géométrie + scoping tenant, sans appel réseau.
vi.mock('@/lib/queues', () => ({
  getEnrichTerrainQueue: () => ({ add: vi.fn(async () => ({ id: 'job-1' })) }),
}));

import { createTerrain, getTerrain, listTerrains } from '@/modules/terrains/service';
import type { ParcelleInput } from '@/modules/terrains/types';

const ORG_ID = '00000000-0000-0000-0000-0000000000cc';

function parcelle(idu: string, surfaceM2: number): ParcelleInput {
  return {
    idu,
    commune: 'Lyon',
    section: 'AB',
    numero: idu.slice(-4),
    surfaceM2,
    geojson: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [4.83, 45.75],
            [4.831, 45.75],
            [4.831, 45.751],
            [4.83, 45.751],
            [4.83, 45.75],
          ],
        ],
      ],
    },
  };
}

beforeAll(async () => {
  await admin.organisation.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: 'Org Terrain Test' },
  });
});

afterAll(async () => {
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  await admin.$disconnect();
});

describe('createTerrain', () => {
  it('crée un terrain, agrège la surface, peuple la géométrie PostGIS, scopé au tenant', async () => {
    const summary = await createTerrain(ORG_ID, null, {
      address: '1 rue Test, Lyon',
      inseeCode: '69381',
      parcelles: [parcelle('69382000AB0062', 500), parcelle('69382000AB0063', 300)],
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

    const fetched = await getTerrain(ORG_ID, summary.id);
    expect(fetched?.id).toBe(summary.id);
    expect((await listTerrains(ORG_ID)).map((t) => t.id)).toContain(summary.id);
  });

  it('refuse une création sans parcelle', async () => {
    await expect(
      createTerrain(ORG_ID, null, { address: 'x', inseeCode: '69381', parcelles: [] }),
    ).rejects.toThrow();
  });

  it('refuse une géométrie invalide', async () => {
    await expect(
      createTerrain(ORG_ID, null, {
        address: 'x',
        inseeCode: '69381',
        parcelles: [
          {
            idu: 'x',
            commune: 'x',
            section: 'x',
            numero: '0001',
            surfaceM2: 1,
            geojson: { type: 'Point' as unknown as 'Polygon', coordinates: [] },
          },
        ],
      }),
    ).rejects.toThrow();
  });
});
