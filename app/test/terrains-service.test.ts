import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin } from '@veriterra/db';

// Enfilage mocké (pas de Redis dans ce test). La donnée parcellaire est fournie par le
// client (issue d'API Carto au clic) : le service la persiste, on teste persistance +
// géométrie + scoping tenant, sans appel réseau.
vi.mock('@/lib/queues', () => ({
  getEnrichTerrainQueue: () => ({ add: vi.fn(async () => ({ id: 'job-1' })) }),
}));

import { createTerrain, getTerrain, listTerrains, updateTerrain } from '@/modules/terrains/service';
import type { ParcelleInput } from '@/modules/terrains/types';

const ORG_ID = '00000000-0000-0000-0000-0000000000cc';
const OTHER_ORG_ID = '00000000-0000-0000-0000-0000000000cd';

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
  await admin.organisation.upsert({
    where: { id: OTHER_ORG_ID },
    update: {},
    create: { id: OTHER_ORG_ID, name: 'Autre Org Terrain Test' },
  });
});

afterAll(async () => {
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  await admin.organisation.delete({ where: { id: OTHER_ORG_ID } }).catch(() => undefined);
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
    expect(summary.status).toBe('A_CONTACTER');

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

describe('updateTerrain', () => {
  async function newTerrain(idu: string) {
    return createTerrain(ORG_ID, null, {
      address: 'a',
      inseeCode: '69381',
      parcelles: [parcelle(idu, 400)],
    });
  }

  it('met à jour les champs manuels et le statut, parcelles intactes', async () => {
    const t = await newTerrain('69382000AB0070');
    const updated = await updateTerrain(ORG_ID, t.id, {
      status: 'A_VISITER',
      prixDemande: 199000,
      notes: 'à revoir',
      label: 'Terrain Nord',
    });
    expect(updated?.status).toBe('A_VISITER');
    expect(updated?.prixDemande).toBe(199000);
    expect(updated?.notes).toBe('à revoir');
    expect(updated?.label).toBe('Terrain Nord');
    expect(updated?.parcelles).toHaveLength(1);
    expect(updated?.surfaceTotaleM2).toBe(400);
  });

  it('permet de vider un champ optionnel (prix vers null)', async () => {
    const t = await createTerrain(ORG_ID, null, {
      address: 'a',
      inseeCode: '69381',
      parcelles: [parcelle('69382000AB0071', 400)],
      prixDemande: 100000,
    });
    const updated = await updateTerrain(ORG_ID, t.id, { prixDemande: null });
    expect(updated?.prixDemande).toBeNull();
  });

  it('refuse un statut invalide', async () => {
    const t = await newTerrain('69382000AB0072');
    await expect(updateTerrain(ORG_ID, t.id, { status: 'NIMPORTE' })).rejects.toThrow();
  });

  it("ignore la modification d'un terrain d'une autre organisation (RLS) et renvoie null", async () => {
    const t = await newTerrain('69382000AB0073');
    const res = await updateTerrain(OTHER_ORG_ID, t.id, { status: 'ECARTE' });
    expect(res).toBeNull();
    const still = await getTerrain(ORG_ID, t.id);
    expect(still?.status).toBe('A_CONTACTER');
  });
});
