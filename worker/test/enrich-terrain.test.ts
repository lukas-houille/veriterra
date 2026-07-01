import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin } from '@veriterra/db';
import { runEnrichTerrain } from '../src/enrich-terrain';

// Pipeline d'enrichissement (Tranche 2 slice 1) : on sème un terrain via `admin` (bypass RLS),
// on mocke Géorisques, et on vérifie que le worker écrit un bloc RISQUES sourcé et scopé.

const ORG_ID = '00000000-0000-0000-0000-0000000000ee';
const TERRAIN_ID = '00000000-0000-0000-0000-0000000000e2';
const PARCELLE_ID = '00000000-0000-0000-0000-0000000000e3';

const POLY = {
  type: 'MultiPolygon',
  coordinates: [[[[4.83, 45.75], [4.831, 45.75], [4.831, 45.751], [4.83, 45.751], [4.83, 45.75]]]],
};

beforeAll(async () => {
  await admin.organisation.upsert({ where: { id: ORG_ID }, update: {}, create: { id: ORG_ID, name: 'Org Enrich Test' } });
  await admin.terrain.upsert({
    where: { id: TERRAIN_ID },
    update: {},
    create: { id: TERRAIN_ID, organisationId: ORG_ID, label: 'T', address: '1 rue Test, Lyon', inseeCode: '69381' },
  });
  await admin.terrainParcelle.upsert({
    where: { id: PARCELLE_ID },
    update: {},
    create: {
      id: PARCELLE_ID,
      organisationId: ORG_ID,
      terrainId: TERRAIN_ID,
      idu: '69381000AA0001',
      commune: 'Lyon',
      section: 'AA',
      numero: '0001',
      surfaceM2: 500,
      geojson: POLY,
      source: 'seed',
    },
  });
});

afterAll(async () => {
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  await admin.$disconnect();
});

afterEach(() => vi.unstubAllGlobals());

describe('runEnrichTerrain', () => {
  it('écrit un bloc RISQUES sourcé (OK) à partir de Géorisques', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/rga')
          ? { codeExposition: '2', exposition: 'Exposition moyenne' }
          : url.includes('/zonage_sismique')
            ? { data: [{ zone_sismicite: '2 - FAIBLE' }] }
            : url.includes('/radon')
              ? { data: [{ classe_potentiel: '1' }] }
              : { data: [{ risques_detail: [{ libelle_risque_long: 'Inondation' }] }] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const result = await runEnrichTerrain({ organizationId: ORG_ID, terrainId: TERRAIN_ID, force: true });
    expect(result.blocks).toEqual([{ type: 'RISQUES', status: 'OK' }]);

    const row = await admin.enrichmentBlock.findFirst({ where: { terrainId: TERRAIN_ID, type: 'RISQUES' } });
    expect(row?.status).toBe('OK');
    expect(row?.source).toBe('Géorisques');
    expect(row?.confidence).toBe('ELEVEE');
    expect(row?.organisationId).toBe(ORG_ID);
    const data = row?.data as { items?: Array<{ key: string; available: boolean }> } | null;
    expect(data?.items?.map((i) => i.key).sort()).toEqual(['argile', 'inondation', 'radon', 'sismicite']);
    expect(data?.items?.every((i) => i.available)).toBe(true);
  });

  it('une panne transitoire totale (503) écrit un bloc ERROR et relance pour réessai', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(
      runEnrichTerrain({ organizationId: ORG_ID, terrainId: TERRAIN_ID, force: true }),
    ).rejects.toThrow(/injoignable/i);
    const row = await admin.enrichmentBlock.findFirst({ where: { terrainId: TERRAIN_ID, type: 'RISQUES' } });
    expect(row?.status).toBe('ERROR');
    expect(row?.error).toBeTruthy();
  });

  it('un terrain inexistant ne produit aucun bloc et ne jette pas', async () => {
    const result = await runEnrichTerrain({ organizationId: ORG_ID, terrainId: '00000000-0000-0000-0000-0000000000ff' });
    expect(result.blocks).toEqual([]);
  });
});
