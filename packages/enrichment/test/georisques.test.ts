import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRisquesGeorisques,
  normalizeArgile,
  normalizeInondation,
  normalizeRadon,
  normalizeSismique,
  summarizeRisques,
} from '../src/georisques';

describe('normalizeArgile', () => {
  it('normalise une exposition avec sévérité', () => {
    const item = normalizeArgile({ codeExposition: '2', exposition: 'Exposition moyenne' });
    expect(item).toMatchObject({ key: 'argile', value: 'Exposition moyenne', severity: 'warning', available: true, source: 'Géorisques' });
  });
  it('dégrade en indisponible sans valeur par défaut', () => {
    const item = normalizeArgile(null);
    expect(item.available).toBe(false);
    expect(item.value).toBeNull();
    expect(item.severity).toBeNull();
  });
});

describe('normalizeSismique', () => {
  it('lit la première zone et mappe la sévérité (zone 2 = info)', () => {
    const item = normalizeSismique({ data: [{ zone_sismicite: '2 - FAIBLE' }] });
    expect(item).toMatchObject({ value: 'Zone de sismicité 2 - FAIBLE', severity: 'info', available: true });
  });
  it('zone 4 = danger', () => {
    expect(normalizeSismique({ data: [{ zone_sismicite: '4 - MOYENNE' }] }).severity).toBe('danger');
  });
  it('data vide = indisponible', () => {
    expect(normalizeSismique({ data: [] }).available).toBe(false);
  });
});

describe('normalizeRadon', () => {
  it('classe 3 = danger avec libellé', () => {
    const item = normalizeRadon({ data: [{ classe_potentiel: '3' }] });
    expect(item).toMatchObject({ value: 'Potentiel significatif (classe 3)', severity: 'danger', available: true });
  });
  it('absence = indisponible', () => {
    expect(normalizeRadon({ data: [] }).available).toBe(false);
    expect(normalizeRadon(null).available).toBe(false);
  });
});

describe('normalizeInondation', () => {
  it('détecte un risque inondation recensé', () => {
    const item = normalizeInondation({ data: [{ risques_detail: [{ libelle_risque_long: 'Inondation par crue' }] }] });
    expect(item).toMatchObject({ value: 'Risque inondation recensé sur la commune', severity: 'warning', available: true });
  });
  it('aucun risque inondation = négatif sourcé (success), pas indisponible', () => {
    const item = normalizeInondation({ data: [{ risques_detail: [{ libelle_risque_long: 'Mouvement de terrain' }] }] });
    expect(item).toMatchObject({ value: 'Aucun risque inondation recensé', severity: 'success', available: true });
  });
  it('réponse non exploitable = indisponible', () => {
    expect(normalizeInondation(null).available).toBe(false);
  });
  it('tableau vide = indisponible (point non résolu), pas un faux négatif', () => {
    expect(normalizeInondation({ data: [] }).available).toBe(false);
  });
});

describe('summarizeRisques', () => {
  it('OK si au moins un risque couvert, confiance élevée', () => {
    const res = summarizeRisques({ items: [normalizeArgile(null), normalizeRadon({ data: [{ classe_potentiel: '1' }] })] });
    expect(res).toEqual({ status: 'OK', confidence: 'ELEVEE' });
  });
  it('UNAVAILABLE si aucun risque couvert', () => {
    const res = summarizeRisques({ items: [normalizeArgile(null), normalizeRadon(null)] });
    expect(res.status).toBe('UNAVAILABLE');
  });
});

describe('fetchRisquesGeorisques', () => {
  afterEach(() => vi.restoreAllMocks());

  it('interroge les 4 sources, renvoie 4 items normalisés, sans erreur transitoire', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/rga')
          ? { codeExposition: '1', exposition: 'Exposition faible' }
          : url.includes('/zonage_sismique')
            ? { data: [{ zone_sismicite: '2 - FAIBLE' }] }
            : url.includes('/radon')
              ? { data: [{ classe_potentiel: '1' }] }
              : { data: [{ risques_detail: [{ libelle_risque_long: 'Inondation' }] }] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const { data, transientError } = await fetchRisquesGeorisques({ lon: 4.83, lat: 45.75, codeInsee: '69381' });
    expect(data.items.map((i) => i.key).sort()).toEqual(['argile', 'inondation', 'radon', 'sismicite']);
    expect(data.items.every((i) => i.available)).toBe(true);
    expect(transientError).toBe(false);
  });

  it('un échec réseau global : items indisponibles ET transientError vrai (à réessayer)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { data, transientError } = await fetchRisquesGeorisques({ lon: 4.83, lat: 45.75, codeInsee: '69381' });
    expect(data.items.every((i) => !i.available)).toBe(true);
    expect(transientError).toBe(true);
  });

  it('un 5xx est transitoire (à réessayer), un 4xx est une absence légitime (non transitoire)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect((await fetchRisquesGeorisques({ lon: 4.83, lat: 45.75, codeInsee: '69381' })).transientError).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const notFound = await fetchRisquesGeorisques({ lon: 4.83, lat: 45.75, codeInsee: '69381' });
    expect(notFound.transientError).toBe(false);
    expect(notFound.data.items.every((i) => !i.available)).toBe(true);
  });
});
