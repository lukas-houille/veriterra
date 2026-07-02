import { describe, expect, it } from 'vitest';
import { allShadows, buildingShadow, isDaylight, shadowLengthM, sunPosition } from '@/lib/sun/shadows';
import type { Polygon, Position } from 'geojson';

// Petit carré (~20 m) autour de (4.85, 45.75), Lyon.
const square: Polygon = {
  type: 'Polygon',
  coordinates: [[[4.85, 45.75], [4.8502, 45.75], [4.8502, 45.7502], [4.85, 45.7502], [4.85, 45.75]]],
};

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
