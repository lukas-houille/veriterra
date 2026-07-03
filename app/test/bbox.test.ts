import { describe, expect, it } from 'vitest';
import { boundsOfGeometries } from '@/lib/geo/bbox';
import type { GeoJsonGeometry } from '@/lib/geo/types';

const polyA: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [[[4.83, 45.75], [4.84, 45.75], [4.84, 45.76], [4.83, 45.76], [4.83, 45.75]]],
};
const multiB: GeoJsonGeometry = {
  type: 'MultiPolygon',
  coordinates: [[[[4.85, 45.74], [4.86, 45.74], [4.86, 45.75], [4.85, 45.75], [4.85, 45.74]]]],
};

describe('boundsOfGeometries', () => {
  it('emprise d\'un seul polygone', () => {
    expect(boundsOfGeometries([polyA])).toEqual([
      [4.83, 45.75],
      [4.84, 45.76],
    ]);
  });

  it('emprise englobante de plusieurs géométries (Polygon + MultiPolygon)', () => {
    expect(boundsOfGeometries([polyA, multiB])).toEqual([
      [4.83, 45.74],
      [4.86, 45.76],
    ]);
  });

  it('null si aucune géométrie (pas d\'emprise inventée)', () => {
    expect(boundsOfGeometries([])).toBeNull();
  });
});
