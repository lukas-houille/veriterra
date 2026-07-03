import type { GeoJsonGeometry } from './types';

// Emprise (bounding box) PURE et testable d'un ensemble de géométries GeoJSON, sans dépendance carte.
// Sert à cadrer la vue sur les parcelles préchargées (fiche / focus terrain).

export type Bounds = [[number, number], [number, number]];

/**
 * Emprise `[[minLon,minLat],[maxLon,maxLat]]` d'un ensemble de géométries GeoJSON (Polygon /
 * MultiPolygon). Parcourt récursivement les coordonnées pour rester agnostique à la profondeur.
 * Renvoie null si aucune coordonnée exploitable (règle 3 : pas d'emprise inventée).
 */
export function boundsOfGeometries(geometries: GeoJsonGeometry[]): Bounds | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const [lon, lat] = c as [number, number];
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    if (Array.isArray(c)) for (const x of c) walk(x);
  };

  for (const g of geometries) walk((g as { coordinates?: unknown }).coordinates);
  if (!Number.isFinite(minLon)) return null;
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
