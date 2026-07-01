import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ZONE_PARCELLE_LIMIT,
  fetchParcellesInBbox,
  filterBySurface,
} from '@/lib/geo/apicarto-core';

// US-1.6 : recherche par surface approchée dans une zone.

describe('filterBySurface', () => {
  const parcelles = [
    { idu: 'a', surfaceM2: 400 },
    { idu: 'b', surfaceM2: 500 },
    { idu: 'c', surfaceM2: 590 },
    { idu: 'd', surfaceM2: 900 },
  ];

  it('garde les parcelles à ±tolérance de la cible', () => {
    const kept = filterBySurface(parcelles, 500, 100).map((p) => p.idu);
    expect(kept).toEqual(['a', 'b', 'c']); // 400, 500, 590 sont à ≤100 m² de 500
  });

  it('inclut les bornes exactes de l\'intervalle', () => {
    const kept = filterBySurface(parcelles, 500, 100).map((p) => p.idu);
    expect(kept).toContain('a'); // 500 - 400 = 100, borne incluse
    expect(kept).not.toContain('d'); // 900 - 500 = 400 > 100
  });

  it('traite une tolérance négative comme sa valeur absolue', () => {
    expect(filterBySurface(parcelles, 500, -100).map((p) => p.idu)).toEqual(['a', 'b', 'c']);
  });

  it('ne retient rien pour une cible nulle ou négative', () => {
    expect(filterBySurface(parcelles, 0, 100)).toEqual([]);
    expect(filterBySurface(parcelles, -50, 100)).toEqual([]);
  });
});

describe('fetchParcellesInBbox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchOnce(features: unknown[]): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ features }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  }

  const feature = (idu: string, contenance: number) => ({
    properties: { idu, section: idu.slice(8, 10), numero: idu.slice(10, 14), nom_com: 'Lyon', contenance },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
  });

  it('normalise les parcelles renvoyées et signale un résultat complet', async () => {
    mockFetchOnce([feature('69123000AY0013', 1657), feature('69123000AY0014', 812)]);
    const { parcelles, truncated } = await fetchParcellesInBbox([4.82, 45.74, 4.84, 45.76]);
    expect(parcelles).toHaveLength(2);
    expect(parcelles[0]).toMatchObject({ idu: '69123000AY0013', surfaceM2: 1657, commune: 'Lyon' });
    expect(truncated).toBe(false);
  });

  it('exclut les parcelles sans contenance connue (jamais un 0 silencieux)', async () => {
    mockFetchOnce([
      feature('69123000AY0013', 500),
      { properties: { idu: '69123000AY0099', nom_com: 'Lyon' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] } },
    ]);
    const { parcelles } = await fetchParcellesInBbox([4.82, 45.74, 4.84, 45.76]);
    expect(parcelles).toHaveLength(1);
    expect(parcelles[0]?.idu).toBe('69123000AY0013');
  });

  it('marque truncated quand le plafond est atteint', async () => {
    const many = Array.from({ length: 3 }, (_, i) => feature(`6912300AY00${10 + i}`, 500));
    mockFetchOnce(many);
    const { truncated } = await fetchParcellesInBbox([4.82, 45.74, 4.84, 45.76], { limit: 3 });
    expect(truncated).toBe(true);
  });

  it('borne la limite au plafond API Carto', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await fetchParcellesInBbox([0, 0, 1, 1], { limit: 999999 });
    const url = String(spy.mock.calls[0]?.[0] ?? '');
    expect(url).toContain(`_limit=${ZONE_PARCELLE_LIMIT}`);
  });

  it('lève si l\'API répond en erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })));
    await expect(fetchParcellesInBbox([0, 0, 1, 1])).rejects.toThrow(/502/);
  });
});
