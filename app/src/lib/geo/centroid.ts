import type { GeoJsonGeometry } from './types';

// Centroïde simple (moyenne des sommets) d'une géométrie GeoJSON. Pur et client-safe :
// utilisé par la route buildings (serveur, bbox BD TOPO) et par SunMap (client, caméra + SunCalc).

/** Point représentatif [lon,lat] d'une géométrie, ou null si vide. */
export function geometryCentroid(geojson: GeoJsonGeometry | null | undefined): { lon: number; lat: number } | null {
  const acc: Array<[number, number]> = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      acc.push([c[0], c[1]]);
      return;
    }
    if (Array.isArray(c)) for (const x of c) walk(x);
  };
  walk(geojson?.coordinates);
  if (acc.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of acc) {
    sx += x;
    sy += y;
  }
  return { lon: sx / acc.length, lat: sy / acc.length };
}

/** Centroïde de la première parcelle exploitable d'une liste. */
export function parcellesCentroid(
  parcelles: Array<{ geojson: GeoJsonGeometry }>,
): { lon: number; lat: number } | null {
  for (const p of parcelles) {
    const c = geometryCentroid(p.geojson);
    if (c) return c;
  }
  return null;
}
