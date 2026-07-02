import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeSlopeAspect, expositionLabel, fetchPente, samplePoints, summarizePente } from '../src/pente';

describe('expositionLabel', () => {
  it('mappe le cap boussole vers 8 directions (0 = Nord, horaire)', () => {
    expect(expositionLabel(0)).toBe('Nord');
    expect(expositionLabel(90)).toBe('Est');
    expect(expositionLabel(180)).toBe('Sud');
    expect(expositionLabel(270)).toBe('Ouest');
    expect(expositionLabel(45)).toBe('Nord-Est');
    expect(expositionLabel(225)).toBe('Sud-Ouest');
    expect(expositionLabel(360)).toBe('Nord'); // wrap
    expect(expositionLabel(-45)).toBe('Nord-Ouest'); // -45 => 315
  });
});

describe('samplePoints', () => {
  it('renvoie 5 points ordonnés [centre, est, ouest, nord, sud]', () => {
    const pts = samplePoints(4.822, 45.762, 20);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual([4.822, 45.762]);
    expect(pts[1]![0]).toBeGreaterThan(4.822); // est
    expect(pts[2]![0]).toBeLessThan(4.822); // ouest
    expect(pts[3]![1]).toBeGreaterThan(45.762); // nord
    expect(pts[4]![1]).toBeLessThan(45.762); // sud
  });
});

describe('computeSlopeAspect', () => {
  it('terrain plat : pente nulle, exposition non marquée', () => {
    const r = computeSlopeAspect([100, 100, 100, 100, 100], 20);
    expect(r.pentePct).toBe(0);
    expect(r.expositionBearingDeg).toBeNull();
    expect(r.expositionLabel).toBeNull();
  });
  it('pente descendant vers le sud (nord haut, sud bas) => exposition Sud', () => {
    const r = computeSlopeAspect([100, 100, 100, 110, 90], 20);
    expect(r.pentePct).toBeCloseTo(50, 5); // (110-90)/40 = 0.5 => 50 %
    expect(r.penteDeg).toBeCloseTo(26.565, 2);
    expect(r.expositionLabel).toBe('Sud');
  });
  it('pente descendant vers l\'est (est bas, ouest haut) => exposition Est', () => {
    const r = computeSlopeAspect([100, 90, 110, 100, 100], 20);
    expect(r.expositionLabel).toBe('Est');
  });
});

describe('summarizePente', () => {
  it('pente absente => indisponible ; présente => OK ; confiance moyenne', () => {
    expect(summarizePente({ altitudeM: null, pentePct: null, penteDeg: null, expositionLabel: null, expositionBearingDeg: null, note: 'x' })).toEqual({ status: 'UNAVAILABLE', confidence: 'MOYENNE' });
    expect(summarizePente({ altitudeM: 292, pentePct: 12, penteDeg: 6.8, expositionLabel: 'Sud', expositionBearingDeg: 180, note: null })).toEqual({ status: 'OK', confidence: 'MOYENNE' });
  });
});

describe('fetchPente', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dérive altitude, pente et exposition depuis les 5 altitudes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ elevations: [100, 100, 100, 110, 90] }), { status: 200 })));
    const { data, transientError } = await fetchPente({ lon: 4.822, lat: 45.762 });
    expect(transientError).toBe(false);
    expect(data.altitudeM).toBe(100);
    expect(data.pentePct).toBe(50);
    expect(data.expositionLabel).toBe('Sud');
    expect(data.note).toBeNull();
  });

  it('hors couverture (sentinelle -99999) => indisponible avec note, sans erreur transitoire', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ elevations: [-99999, -99999, -99999, -99999, -99999] }), { status: 200 })));
    const { data, transientError } = await fetchPente({ lon: -30, lat: 40 });
    expect(transientError).toBe(false);
    expect(data.pentePct).toBeNull();
    expect(data.note).toMatch(/couverture/i);
  });

  it('réponse malformée => indisponible avec note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const { data } = await fetchPente({ lon: 4.822, lat: 45.762 });
    expect(data.pentePct).toBeNull();
    expect(data.note).toBeTruthy();
  });

  it('un 5xx marque transientError (à réessayer)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const { transientError } = await fetchPente({ lon: 4.822, lat: 45.762 });
    expect(transientError).toBe(true);
  });
});
