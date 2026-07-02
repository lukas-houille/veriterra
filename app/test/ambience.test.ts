import { describe, expect, it } from 'vitest';
import { ambienceForAltitude } from '@/lib/sun/ambience';

// L'ambiance est un voile visuel dérivé de la seule hauteur du soleil : continue, bornée, et
// clairement plus sombre/chaude la nuit qu'en plein jour. (Aucune donnée affichée n'en dépend.)
describe('ambienceForAltitude', () => {
  it('plein jour : façades claires, ombres franches, voile quasi nul', () => {
    const a = ambienceForAltitude(60);
    expect(a.buildingColor.toLowerCase()).toBe('#c7ccda');
    expect(a.shadowOpacity).toBeCloseTo(0.3, 5);
    expect(a.overlay.opacity).toBeCloseTo(0, 5);
    expect(a.overlay.blend).toBe('normal');
  });

  it('nuit profonde : bornée à l\'ancre nuit, voile multiply marqué, pas d\'ombre', () => {
    const a = ambienceForAltitude(-20); // sous -6°, borné
    expect(a.buildingColor.toLowerCase()).toBe('#363e58');
    expect(a.shadowOpacity).toBeCloseTo(0, 5);
    expect(a.overlay.blend).toBe('multiply');
    expect(a.overlay.opacity).toBeGreaterThan(0.4);
  });

  it('interpole continûment au crépuscule (heure dorée entre 0° et 6°)', () => {
    const a = ambienceForAltitude(3);
    // À mi-chemin des ancres 0° et 6° : opacité du voile entre les deux (0,22 et 0,18).
    expect(a.overlay.opacity).toBeGreaterThan(0.18);
    expect(a.overlay.opacity).toBeLessThan(0.22);
    expect(a.overlay.blend).toBe('soft-light');
  });

  it('le voile est plus opaque la nuit qu\'en plein jour (extinction)', () => {
    expect(ambienceForAltitude(-6).overlay.opacity).toBeGreaterThan(ambienceForAltitude(40).overlay.opacity);
  });

  it('le ciel du jour est plus clair (composante bleue plus haute) que celui de la nuit', () => {
    const day = ambienceForAltitude(40).sky['sky-color'];
    const night = ambienceForAltitude(-6).sky['sky-color'];
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    expect(blue(day)).toBeGreaterThan(blue(night));
  });

  it('rend toujours des couleurs hex valides et un blend connu', () => {
    for (const alt of [-30, -6, -3, 0, 3, 6, 12, 20, 45, 90]) {
      const a = ambienceForAltitude(alt);
      expect(a.sky['sky-color']).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.buildingColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(['soft-light', 'multiply', 'normal']).toContain(a.overlay.blend);
    }
  });
});
