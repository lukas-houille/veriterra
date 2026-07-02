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
  it('écrit les blocs RISQUES et PRIX_DVF sourcés (OK) à partir des sources', async () => {
    const mut = (id: string, vf: string, st: string) => ({ id_mutation: id, nature_mutation: 'Vente', valeur_fonciere: vf, type_local: 'None', surface_terrain: st, code_nature_culture: 'AB', nature_culture: 'Terrain à bâtir' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/mutations3')) {
          return new Response(JSON.stringify({ mutations: [mut('A', '50000', '500'), mut('B', '60000', '500'), mut('C', '70000', '500')] }), { status: 200 });
        }
        if (url.includes('/calcul/alti/')) {
          // 5 altitudes [centre, est, ouest, nord, sud] : pente descendant vers le sud.
          return new Response(JSON.stringify({ elevations: [100, 100, 100, 110, 90] }), { status: 200 });
        }
        if (url.includes('overpass')) {
          // Un commerce et une école proches du centroïde du terrain (Lyon 69381).
          return new Response(JSON.stringify({ elements: [
            { lat: 45.7508, lon: 4.8305, tags: { shop: 'bakery' } },
            { lat: 45.7512, lon: 4.8305, tags: { amenity: 'school' } },
          ] }), { status: 200 });
        }
        // API Carto GPU (PLU) : commune non RNU, zone U, document PLU.
        if (url.includes('/api/gpu/municipality')) {
          return new Response(JSON.stringify({ features: [{ properties: { is_rnu: false, name: 'LYON' } }] }), { status: 200 });
        }
        if (url.includes('/api/gpu/zone-urba')) {
          return new Response(JSON.stringify({ features: [{ properties: { typezone: 'U', libelle: 'UA', partition: 'DU_69381', datvalid: '20240101' } }] }), { status: 200 });
        }
        if (url.includes('/api/gpu/document')) {
          return new Response(JSON.stringify({ features: [{ properties: { du_type: 'PLU', grid_title: 'PLU LYON' } }] }), { status: 200 });
        }
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
    expect(result.blocks).toEqual([
      { type: 'RISQUES', status: 'OK' },
      { type: 'PRIX_DVF', status: 'OK' },
      { type: 'PENTE', status: 'OK' },
      { type: 'SERVICES', status: 'OK' },
      { type: 'PLU', status: 'OK' },
    ]);

    const risques = await admin.enrichmentBlock.findFirst({ where: { terrainId: TERRAIN_ID, type: 'RISQUES' } });
    expect(risques?.status).toBe('OK');
    expect(risques?.source).toBe('Géorisques');
    expect(risques?.confidence).toBe('ELEVEE');
    expect(risques?.organisationId).toBe(ORG_ID);
    const rData = risques?.data as { items?: Array<{ key: string; available: boolean }> } | null;
    expect(rData?.items?.map((i) => i.key).sort()).toEqual(['argile', 'inondation', 'radon', 'sismicite']);
    expect(rData?.items?.every((i) => i.available)).toBe(true);

    const prix = await admin.enrichmentBlock.findFirst({ where: { terrainId: TERRAIN_ID, type: 'PRIX_DVF' } });
    expect(prix?.status).toBe('OK');
    expect(prix?.source).toContain('DVF');
    const pData = prix?.data as { estimationM2?: number; nbComparables?: number } | null;
    expect(pData?.nbComparables).toBe(3);
    expect(pData?.estimationM2).toBe(120);
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

  it('une panne Overpass (503) écrit un bloc SERVICES ERROR, jamais un faux « aucun service » (règle 3)', async () => {
    // Overpass échoue (transitoire), les autres sources répondent (peu importe le contenu).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('overpass')
          ? new Response('', { status: 503 })
          : new Response(JSON.stringify({}), { status: 200 }),
      ),
    );
    await expect(
      runEnrichTerrain({ organizationId: ORG_ID, terrainId: TERRAIN_ID, force: true }),
    ).rejects.toThrow(/injoignable/i);
    const svc = await admin.enrichmentBlock.findFirst({ where: { terrainId: TERRAIN_ID, type: 'SERVICES' } });
    expect(svc?.status).toBe('ERROR');
    expect(svc?.error).toBeTruthy();
  });

  it('un terrain inexistant ne produit aucun bloc et ne jette pas', async () => {
    const result = await runEnrichTerrain({ organizationId: ORG_ID, terrainId: '00000000-0000-0000-0000-0000000000ff' });
    expect(result.blocks).toEqual([]);
  });
});
