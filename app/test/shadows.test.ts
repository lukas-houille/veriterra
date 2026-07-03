import { describe, expect, it } from 'vitest';
import { allShadows, buildingShadow, isDaylight, shadowLengthM, sunPosition } from '@/lib/sun/shadows';
import type { MultiPolygon, Polygon, Position } from 'geojson';

// Petit carré (~20 m) autour de (4.85, 45.75), Lyon.
const square: Polygon = {
  type: 'Polygon',
  coordinates: [[[4.85, 45.75], [4.8502, 45.75], [4.8502, 45.7502], [4.85, 45.7502], [4.85, 45.75]]],
};

// Forêt en « fer à cheval » (C ouvert vers l'est) ceinturant une cuvette centrale. Son enveloppe
// convexe est le rectangle plein : elle « remplit » la cuvette. Le centre du creux est DANS
// l'enveloppe convexe mais HORS de l'emprise réelle.
const horseshoe: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [4.0, 45.0],
      [4.01, 45.0],
      [4.01, 45.002],
      [4.002, 45.002],
      [4.002, 45.008],
      [4.01, 45.008],
      [4.01, 45.01],
      [4.0, 45.01],
      [4.0, 45.0],
    ],
  ],
};
// Centre de la cuvette (dans le creux du fer à cheval, hors emprise réelle).
const notchCenter: Position = [4.006, 45.005];

/** Point-dans-anneau par lancer de rayon (test pur, sans dépendance). */
function pointInRing(pt: Position, ring: Position[]): boolean {
  const [x, y] = pt as [number, number];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Point dans un Polygon/MultiPolygon (anneau extérieur, moins les trous). */
function pointInGeom(pt: Position, geom: Polygon | MultiPolygon): boolean {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    const outer = poly[0] as Position[];
    if (!pointInRing(pt, outer)) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(pt, poly[h] as Position[])) inHole = true;
    if (!inHole) return true;
  }
  return false;
}

function maxLat(coords: unknown): number {
  let m = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      m = Math.max(m, (c as Position)[1]!);
      return;
    }
    if (Array.isArray(c)) for (const x of c) walk(x);
  };
  walk(coords);
  return m;
}

describe('sunPosition', () => {
  it('azimut cap boussole (midi solaire ~ sud 180), matin à l\'est, nuit sous l\'horizon', () => {
    // Midi solaire à Lyon le 21/06 (~11:42 UTC) : soleil plein sud (~180°) et haut. Verrouille
    // la convention du build suncalc (north-based clockwise en degrés).
    const noon = sunPosition(new Date('2026-06-21T11:42:00Z'), 45.75, 4.85);
    expect(noon.altitudeDeg).toBeGreaterThan(60);
    expect(Math.abs(noon.azimuthDeg - 180)).toBeLessThan(8);
    // Matin : soleil à l'est du sud (azimut < 180).
    const morning = sunPosition(new Date('2026-06-21T08:00:00Z'), 45.75, 4.85);
    expect(morning.azimuthDeg).toBeLessThan(180);
    expect(morning.azimuthDeg).toBeGreaterThan(60);
    // Nuit : sous l'horizon.
    const night = sunPosition(new Date('2026-06-21T00:00:00Z'), 45.75, 4.85);
    expect(night.altitudeDeg).toBeLessThan(0);
    expect(isDaylight(night)).toBe(false);
  });
});

describe('shadowLengthM', () => {
  it('L = hauteur / tan(altitude), borné près de l\'horizon', () => {
    expect(shadowLengthM(10, 45)).toBeCloseTo(10, 5);
    expect(shadowLengthM(10, 30)).toBeCloseTo(17.32, 1);
    expect(shadowLengthM(100, 0.1)).toBe(2000); // borne anti-dégénérescence
  });
});

describe('buildingShadow', () => {
  const day: { azimuthDeg: number; altitudeDeg: number } = { azimuthDeg: 180, altitudeDeg: 45 }; // plein sud, 45°
  it('null sans hauteur, la nuit, ou soleil trop bas', () => {
    expect(buildingShadow(square, null, day)).toBeNull();
    expect(buildingShadow(square, 10, { azimuthDeg: 180, altitudeDeg: -5 })).toBeNull();
    expect(buildingShadow(square, 10, { azimuthDeg: 180, altitudeDeg: 0.2 })).toBeNull();
  });
  it('soleil au sud => ombre projetée vers le nord (latitude étendue)', () => {
    const shadow = buildingShadow(square, 10, day);
    expect(shadow).not.toBeNull();
    expect(shadow!.geometry.type).toBe('Polygon');
    expect(maxLat(shadow!.geometry.coordinates)).toBeGreaterThan(45.7502);
  });
});

describe('buildingShadow, canopée concave (balayage)', () => {
  // Soleil haut (ombre courte) : le balayage ne s'étend quasiment pas, il épouse l'emprise.
  const haut: { azimuthDeg: number; altitudeDeg: number } = { azimuthDeg: 180, altitudeDeg: 70 };

  it('l\'enveloppe convexe recouvre la cuvette (bug), le balayage ne la recouvre pas (corrigé)', () => {
    const hull = buildingShadow(horseshoe, 10, haut);
    const swept = buildingShadow(horseshoe, 10, haut, { sweep: true });
    expect(hull).not.toBeNull();
    expect(swept).not.toBeNull();
    // Le tracé historique (enveloppe convexe) ombre à tort le centre du fer à cheval...
    expect(pointInGeom(notchCenter, hull!.geometry)).toBe(true);
    // ...le balayage garde l'ombre sur l'emprise réelle : la cuvette n'est plus ombrée toute la journée.
    expect(pointInGeom(notchCenter, swept!.geometry)).toBe(false);
  });

  it('renvoie une géométrie surfacique valide (Polygon ou MultiPolygon)', () => {
    const swept = buildingShadow(horseshoe, 10, haut, { sweep: true });
    expect(swept).not.toBeNull();
    expect(['Polygon', 'MultiPolygon']).toContain(swept!.geometry.type);
  });

  it('pas d\'ombre balayée la nuit (règle 3)', () => {
    expect(buildingShadow(horseshoe, 10, { azimuthDeg: 0, altitudeDeg: -5 }, { sweep: true })).toBeNull();
  });
});

describe('allShadows', () => {
  it('exclut et compte les bâtiments sans hauteur (règle 3)', () => {
    const res = allShadows(
      [
        { geometry: square, hauteur: 10 },
        { geometry: square, hauteur: null },
        { geometry: square, hauteur: 0 },
      ],
      { azimuthDeg: 180, altitudeDeg: 45 },
    );
    expect(res.shadows).toHaveLength(1);
    expect(res.sansHauteur).toBe(2);
  });
});
