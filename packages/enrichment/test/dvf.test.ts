import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computePrixDvf,
  fetchPrixDvf,
  isHorsCouvertureDvf,
  landComparables,
  summarizePrixDvf,
} from '../src/dvf';
import type { DvfComparable } from '../src/types';

describe('isHorsCouvertureDvf', () => {
  it('vrai en Alsace-Moselle (57/67/68) et à Mayotte (976), faux ailleurs', () => {
    expect(isHorsCouvertureDvf('67482')).toBe(true);
    expect(isHorsCouvertureDvf('57000')).toBe(true);
    expect(isHorsCouvertureDvf('68066')).toBe(true);
    expect(isHorsCouvertureDvf('97601')).toBe(true);
    expect(isHorsCouvertureDvf('69381')).toBe(false);
    expect(isHorsCouvertureDvf('33063')).toBe(false);
  });
});

describe('landComparables', () => {
  const ab = (over: Record<string, string>) => ({
    nature_mutation: 'Vente',
    type_local: 'None',
    code_nature_culture: 'AB',
    nature_culture: 'Terrain à bâtir',
    ...over,
  });

  it('agrège une mutation terrain à bâtir multi-lignes et calcule le €/m²', () => {
    const comps = landComparables([
      ab({ id_mutation: 'A', valeur_fonciere: '45000', surface_terrain: '533' }),
      ab({ id_mutation: 'A', valeur_fonciere: '45000', surface_terrain: '294' }),
    ]);
    expect(comps).toHaveLength(1);
    expect(comps[0]?.surfaceM2).toBe(827);
    expect(Math.round(comps[0]?.prixM2 ?? 0)).toBe(54); // 45000 / 827
  });

  it('accepte la nature de mutation "Vente terrain à bâtir"', () => {
    const comps = landComparables([
      ab({ id_mutation: 'V', nature_mutation: 'Vente terrain à bâtir', valeur_fonciere: '52536', surface_terrain: '398' }),
    ]);
    expect(comps).toHaveLength(1);
  });

  it('exclut bâti, agricole, mélange, natures non-vente et aberrations', () => {
    const comps = landComparables([
      { id_mutation: 'B', nature_mutation: 'Vente', type_local: 'Maison', code_nature_culture: 'AB', nature_culture: 'Terrain à bâtir', valeur_fonciere: '300000', surface_terrain: '500' }, // bâti
      { id_mutation: 'G', nature_mutation: 'Vente', type_local: 'None', code_nature_culture: 'P', nature_culture: 'prés', valeur_fonciere: '3000', surface_terrain: '5000' }, // agricole (non AB)
      ab({ id_mutation: 'M', valeur_fonciere: '100000', surface_terrain: '400' }), // mélange : une ligne AB...
      { id_mutation: 'M', nature_mutation: 'Vente', type_local: 'None', code_nature_culture: 'S', nature_culture: 'sols', valeur_fonciere: '100000', surface_terrain: '200' }, // ...et une non-AB => exclu
      ab({ id_mutation: 'C', valeur_fonciere: '5000000', surface_terrain: '10' }), // 500 000 €/m² => aberrant
      ab({ id_mutation: 'D', nature_mutation: 'Echange', valeur_fonciere: '10000', surface_terrain: '100' }), // pas une vente
    ]);
    expect(comps).toHaveLength(0);
  });
});

describe('computePrixDvf', () => {
  const comp = (prixM2: number, date = '2025-01-01'): DvfComparable => ({ date, prixM2, surfaceM2: 500, valeur: prixM2 * 500 });

  it('sous 3 comparables : pas d\'estimation, note explicite (règle 3)', () => {
    const res = computePrixDvf([comp(100), comp(200)]);
    expect(res.estimationM2).toBeNull();
    expect(res.nbComparables).toBe(2);
    expect(res.note).toBeTruthy();
  });

  it('médiane et quartiles à partir de 3 comparables', () => {
    const res = computePrixDvf([comp(100), comp(200), comp(300)]);
    expect(res.estimationM2).toBe(200);
    expect(res.fourchetteBasseM2).toBe(150);
    expect(res.fourchetteHauteM2).toBe(250);
    expect(res.nbComparables).toBe(3);
    expect(res.note).toBeNull();
  });
});

describe('summarizePrixDvf', () => {
  it('null => indisponible ; >=8 comparables => confiance élevée ; sinon moyenne', () => {
    expect(summarizePrixDvf({ estimationM2: null, fourchetteBasseM2: null, fourchetteHauteM2: null, nbComparables: 0, dernieresVentes: [], note: 'x' })).toEqual({ status: 'UNAVAILABLE', confidence: 'FAIBLE' });
    expect(summarizePrixDvf({ estimationM2: 200, fourchetteBasseM2: 150, fourchetteHauteM2: 250, nbComparables: 9, dernieresVentes: [], note: null })).toEqual({ status: 'OK', confidence: 'ELEVEE' });
    expect(summarizePrixDvf({ estimationM2: 200, fourchetteBasseM2: 150, fourchetteHauteM2: 250, nbComparables: 4, dernieresVentes: [], note: null }).confidence).toBe('MOYENNE');
  });
});

describe('fetchPrixDvf', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hors couverture : indisponible avec note, sans erreur transitoire', async () => {
    const { data, transientError } = await fetchPrixDvf({ codeInsee: '67482', sections: [{ commune: '67482', section: '000AB' }] });
    expect(transientError).toBe(false);
    expect(data.estimationM2).toBeNull();
    expect(data.note).toMatch(/hors couverture/i);
  });

  it('agrège les mutations et calcule une estimation', async () => {
    const mut = (id: string, vf: string, st: string) => ({ id_mutation: id, nature_mutation: 'Vente', valeur_fonciere: vf, type_local: 'None', surface_terrain: st, code_nature_culture: 'AB', nature_culture: 'Terrain à bâtir' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      mutations: [mut('A', '50000', '500'), mut('B', '60000', '500'), mut('C', '70000', '500')],
    }), { status: 200 })));
    const { data, transientError } = await fetchPrixDvf({ codeInsee: '69381', sections: [{ commune: '69381', section: '000AB' }] });
    expect(transientError).toBe(false);
    expect(data.nbComparables).toBe(3);
    expect(data.estimationM2).toBe(120); // médiane de 100,120,140
  });

  it('un 5xx marque transientError (à réessayer)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const { transientError } = await fetchPrixDvf({ codeInsee: '69381', sections: [{ commune: '69381', section: '000AB' }] });
    expect(transientError).toBe(true);
  });
});
