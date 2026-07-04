import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchElevations,
  formatMeters,
  formatPercent,
  formatSquareMeters,
  isSelfIntersectingRing,
  lineLengthMeters,
  nearestBoundaryDistance,
  polygonAreaMeters,
  polygonPerimeterMeters,
  ringCentroid,
  segmentMidpoint,
  slopeBetween,
  type LngLat,
} from '@/lib/geo/measure';
import type { GeoJsonGeometry } from '@/lib/geo/types';

describe('lineLengthMeters', () => {
  it('longueur nulle sous deux points', () => {
    expect(lineLengthMeters([])).toBe(0);
    expect(lineLengthMeters([[0, 0]])).toBe(0);
  });

  it('un degré de latitude vaut environ 111 km', () => {
    const m = lineLengthMeters([
      [0, 0],
      [0, 1],
    ]);
    expect(m).toBeGreaterThan(111000);
    expect(m).toBeLessThan(111400);
  });

  it('somme les segments d\'une polyligne', () => {
    const oneSeg = lineLengthMeters([
      [0, 0],
      [0, 1],
    ]);
    const twoSeg = lineLengthMeters([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(twoSeg).toBeGreaterThan(oneSeg * 1.99);
    expect(twoSeg).toBeLessThan(oneSeg * 2.01);
  });
});

describe('polygonAreaMeters / polygonPerimeterMeters', () => {
  // Carré d'environ 100 m de côté près de l'équateur (1° lat ~ 111195 m).
  const side = 100 / 111195;
  const square: LngLat[] = [
    [0, 0],
    [side, 0],
    [side, side],
    [0, side],
  ];

  it('aire nulle sous trois sommets', () => {
    expect(polygonAreaMeters([[0, 0], [side, 0]])).toBe(0);
  });

  it('aire d\'un carré ~100 m de côté vaut ~10 000 m²', () => {
    const a = polygonAreaMeters(square);
    expect(a).toBeGreaterThan(9500);
    expect(a).toBeLessThan(10500);
  });

  it('ferme l\'anneau automatiquement (même aire avec ou sans sommet de fermeture)', () => {
    const closed = [...square, [0, 0] as LngLat];
    expect(polygonAreaMeters(closed)).toBeCloseTo(polygonAreaMeters(square), 3);
  });

  it('périmètre d\'un carré ~100 m vaut ~400 m', () => {
    const p = polygonPerimeterMeters(square);
    expect(p).toBeGreaterThan(395);
    expect(p).toBeLessThan(405);
  });
});

describe('segmentMidpoint / ringCentroid', () => {
  it('milieu de segment = moyenne des extrémités', () => {
    expect(segmentMidpoint([0, 0], [2, 4])).toEqual([1, 2]);
    expect(segmentMidpoint([-1, -1], [1, 1])).toEqual([0, 0]);
  });

  it('centroïde d\'anneau = moyenne des sommets', () => {
    expect(ringCentroid([[0, 0], [2, 0], [2, 2], [0, 2]])).toEqual([1, 1]);
  });

  it('centroïde null pour un anneau vide', () => {
    expect(ringCentroid([])).toBeNull();
  });
});

describe('isSelfIntersectingRing', () => {
  it('faux pour un carré simple', () => {
    expect(
      isSelfIntersectingRing([
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ]),
    ).toBe(false);
  });

  it('faux sous 4 sommets (ne peut pas se croiser)', () => {
    expect(isSelfIntersectingRing([[0, 0], [1, 1], [2, 0]])).toBe(false);
  });

  it('vrai pour un nœud papillon (arêtes croisées)', () => {
    // Les arêtes (0,0)->(1,1) et (1,0)->(0,1) se croisent au centre.
    expect(
      isSelfIntersectingRing([
        [0, 0],
        [0.001, 0.001],
        [0.001, 0],
        [0, 0.001],
      ]),
    ).toBe(true);
  });
});

describe('slopeBetween', () => {
  it('dénivelé signé et pente %', () => {
    expect(slopeBetween(100, 110, 50)).toEqual({ deltaZ: 10, slopePct: 20 });
    expect(slopeBetween(110, 100, 50)).toEqual({ deltaZ: -10, slopePct: 20 });
  });

  it('pente null si distance horizontale ~nulle (pas de division par zéro)', () => {
    expect(slopeBetween(100, 100, 0)).toEqual({ deltaZ: 0, slopePct: null });
  });
});

describe('nearestBoundaryDistance', () => {
  const square: GeoJsonGeometry = {
    type: 'Polygon',
    coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
  };

  it('distance courte au contour et point le plus proche', () => {
    // Point intérieur à ~0,0001° (~11 m) au-dessus de l'arête inférieure (y=0).
    const nb = nearestBoundaryDistance([0.0005, 0.0001], square);
    expect(nb).not.toBeNull();
    expect(nb!.distanceM).toBeGreaterThan(9);
    expect(nb!.distanceM).toBeLessThan(13);
    expect(nb!.nearestPoint[1]).toBeCloseTo(0, 4);
  });

  it('gère un MultiPolygon (min sur tous les anneaux)', () => {
    const multi: GeoJsonGeometry = { type: 'MultiPolygon', coordinates: [square.coordinates as number[][][]] };
    const nb = nearestBoundaryDistance([0.0005, 0.0001], multi);
    expect(nb).not.toBeNull();
    expect(nb!.distanceM).toBeGreaterThan(9);
    expect(nb!.distanceM).toBeLessThan(13);
  });

  it('null si aucun anneau exploitable (règle 3)', () => {
    const empty: GeoJsonGeometry = { type: 'Polygon', coordinates: [[]] };
    expect(nearestBoundaryDistance([0, 0], empty)).toBeNull();
  });
});

describe('fetchElevations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: () => Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('renvoie les altitudes des points', async () => {
    stubFetch(async () => new Response(JSON.stringify({ elevations: [167.76, 162.2] }), { status: 200 }));
    await expect(fetchElevations([[4.83, 45.76], [4.84, 45.77]])).resolves.toEqual([167.76, 162.2]);
  });

  it('mappe la sentinelle NODATA sur null, jamais un 0 (règle 3)', async () => {
    stubFetch(async () => new Response(JSON.stringify({ elevations: [100, -99999] }), { status: 200 }));
    await expect(fetchElevations([[0, 0], [1, 1]])).resolves.toEqual([100, null]);
  });

  it('throw si la source est injoignable (statut non-ok)', async () => {
    stubFetch(async () => new Response('erreur', { status: 502 }));
    await expect(fetchElevations([[0, 0]])).rejects.toThrow(/502/);
  });

  it('throw si la réponse est mal formée', async () => {
    stubFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    await expect(fetchElevations([[0, 0]])).rejects.toThrow();
  });

  it('liste vide sans appel réseau', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await expect(fetchElevations([])).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('formatage métrique (règles 4 et 5)', () => {
  it('mètres avec virgule décimale', () => {
    expect(formatMeters(123.45)).toBe('123,5 m');
  });
  it('surface arrondie en m²', () => {
    expect(formatSquareMeters(500.4)).toBe('500 m²');
  });
  it('pourcentage avec virgule décimale', () => {
    expect(formatPercent(7.2)).toBe('7,2 %');
  });
});
