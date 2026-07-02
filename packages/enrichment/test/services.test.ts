import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyService,
  fetchServices,
  haversineM,
  summarizeElements,
  summarizeServices,
  type OsmElement,
} from '../src/services';

describe('haversineM', () => {
  it('donne 0 pour un point identique et ~1 km pour 0,009° de latitude', () => {
    expect(haversineM(45.75, 4.85, 45.75, 4.85)).toBe(0);
    const d = haversineM(45.75, 4.85, 45.759, 4.85);
    expect(d).toBeGreaterThan(980);
    expect(d).toBeLessThan(1020);
  });
});

describe('classifyService', () => {
  it('classe écoles / commerces / transports, ignore le reste', () => {
    expect(classifyService({ amenity: 'school' })).toBe('ecoles');
    expect(classifyService({ amenity: 'kindergarten' })).toBe('ecoles');
    expect(classifyService({ shop: 'bakery' })).toBe('commerces');
    expect(classifyService({ highway: 'bus_stop' })).toBe('transports');
    expect(classifyService({ public_transport: 'platform' })).toBe('transports');
    expect(classifyService({ railway: 'tram_stop' })).toBe('transports');
    expect(classifyService({ railway: 'rail' })).toBeNull(); // ligne, pas une station
    expect(classifyService({ amenity: 'restaurant' })).toBeNull();
    expect(classifyService(undefined)).toBeNull();
  });
});

describe('summarizeElements', () => {
  const origin = { lat: 45.75, lon: 4.85 };
  it('agrège distance au plus proche + nombre par catégorie', () => {
    const els: OsmElement[] = [
      { lat: 45.751, lon: 4.85, tags: { amenity: 'school' } }, // ~111 m
      { lat: 45.7505, lon: 4.85, tags: { shop: 'bakery' } }, // ~56 m
      { lat: 45.752, lon: 4.85, tags: { shop: 'convenience' } }, // ~222 m
      { center: { lat: 45.7502, lon: 4.85 }, tags: { railway: 'tram_stop' } }, // way avec center
    ];
    const items = summarizeElements(els, origin);
    const by = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(by.ecoles!.count).toBe(1);
    expect(by.ecoles!.nearestM).toBeGreaterThan(100);
    expect(by.commerces!.count).toBe(2);
    expect(by.commerces!.nearestM!).toBeLessThan(100); // le plus proche des deux commerces
    expect(by.transports!.count).toBe(1); // via le center du way
    expect(by.transports!.nearestM).not.toBeNull();
  });
  it('catégorie sans élément : nearestM null, count 0 (réponse réelle, pas indisponible)', () => {
    const items = summarizeElements([], origin);
    expect(items.every((i) => i.nearestM === null && i.count === 0)).toBe(true);
    expect(items.map((i) => i.key).sort()).toEqual(['commerces', 'ecoles', 'transports']);
  });
});

describe('summarizeServices', () => {
  it('note nulle => OK ; note présente => indisponible ; confiance moyenne', () => {
    expect(summarizeServices({ radiusM: 1500, items: [], note: null })).toEqual({ status: 'OK', confidence: 'MOYENNE' });
    expect(summarizeServices({ radiusM: 1500, items: [], note: 'x' })).toEqual({ status: 'UNAVAILABLE', confidence: 'MOYENNE' });
  });
});

describe('fetchServices', () => {
  afterEach(() => vi.restoreAllMocks());

  it('agrège les éléments Overpass en distances par catégorie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      elements: [
        { lat: 45.751, lon: 4.85, tags: { amenity: 'school' } },
        { lat: 45.7505, lon: 4.85, tags: { shop: 'bakery' } },
      ],
    }), { status: 200 })));
    const { data, transientError } = await fetchServices({ lon: 4.85, lat: 45.75 });
    expect(transientError).toBe(false);
    expect(data.note).toBeNull();
    const by = Object.fromEntries(data.items.map((i) => [i.key, i]));
    expect(by.ecoles!.count).toBe(1);
    expect(by.commerces!.count).toBe(1);
    expect(by.transports!.count).toBe(0);
  });

  it('réponse illisible => indisponible avec note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const { data } = await fetchServices({ lon: 4.85, lat: 45.75 });
    expect(data.note).toBeTruthy();
  });

  it('un 429 (rate-limit) marque transientError (à réessayer)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    const { transientError } = await fetchServices({ lon: 4.85, lat: 45.75 });
    expect(transientError).toBe(true);
  });
});
