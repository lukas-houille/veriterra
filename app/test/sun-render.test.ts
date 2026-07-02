import { describe, expect, it } from 'vitest';
import { sunShadowsFor, toExtrusionFC, type SunVolume } from '@/lib/sun/sun-render';
import type { SunPos } from '@/lib/sun/shadows';

const square: SunVolume['geometry'] = {
  type: 'Polygon',
  coordinates: [[[4, 45], [4.001, 45], [4.001, 45.001], [4, 45.001], [4, 45]]],
};

describe('toExtrusionFC', () => {
  it('porte la hauteur dans la propriété `hauteur` (null si inconnue)', () => {
    const fc = toExtrusionFC([
      { geometry: square, hauteur: 12 },
      { geometry: square, hauteur: null },
    ]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toEqual({ hauteur: 12 });
    expect(fc.features[1]!.properties).toEqual({ hauteur: null });
  });
});

describe('sunShadowsFor', () => {
  const midi: SunPos = { azimuthDeg: 180, altitudeDeg: 45 }; // soleil haut au sud

  it('agrège les ombres du bâti et de la végétation, exclut et compte les volumes sans hauteur', () => {
    const { shadows, sansHauteur } = sunShadowsFor(
      [{ geometry: square, hauteur: 15 }, { geometry: square, hauteur: null }],
      [{ geometry: square, hauteur: 12 }],
      midi,
    );
    expect(shadows).toHaveLength(2); // un bâtiment (15 m) + une canopée (12 m)
    expect(sansHauteur).toBe(1); // le bâtiment sans hauteur
  });

  it("ne projette aucune ombre la nuit (soleil sous l'horizon)", () => {
    const nuit: SunPos = { azimuthDeg: 0, altitudeDeg: -10 };
    const { shadows } = sunShadowsFor([{ geometry: square, hauteur: 15 }], [{ geometry: square, hauteur: 12 }], nuit);
    expect(shadows).toHaveLength(0);
  });
});
