import { describe, expect, it } from 'vitest';
import { zoomForBanType } from '@/lib/geo/ban';

// Zoom d'adresse adaptatif : une commune se cadre large, un numéro serré. Un mapping cassé
// (renommage BAN, faute de frappe) retomberait sinon silencieusement sur le fallback.
describe('zoomForBanType', () => {
  it('cadre large pour une commune ou un lieu-dit, serré pour une rue ou un numéro', () => {
    expect(zoomForBanType('municipality')).toBe(13);
    expect(zoomForBanType('locality')).toBe(14);
    expect(zoomForBanType('street')).toBe(16);
    expect(zoomForBanType('housenumber')).toBe(17);
  });
  it('retombe sur un zoom intermédiaire (15) pour un type inconnu ou vide', () => {
    expect(zoomForBanType('')).toBe(15);
    expect(zoomForBanType('road')).toBe(15);
  });
  it('la commune se cadre plus large que le numéro', () => {
    expect(zoomForBanType('municipality')).toBeLessThan(zoomForBanType('housenumber'));
  });
});
