import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReglementUrl, fetchPlu, pickZone, summarizePlu } from '../src/plu';

const fc = (props: Record<string, unknown> | null) => ({
  type: 'FeatureCollection',
  features: props ? [{ type: 'Feature', properties: props }] : [],
});

describe('pickZone', () => {
  it('extrait la première zone, ou null si vide', () => {
    expect(pickZone(fc({ typezone: 'U', libelle: 'UPp', libelong: 'desc', partition: 'DU_1', datvalid: '20260326' }))).toEqual({
      typezone: 'U',
      libelle: 'UPp',
      libelong: 'desc',
      partition: 'DU_1',
      datvalid: '20260326',
    });
    expect(pickZone(fc(null))).toBeNull();
    expect(pickZone({})).toBeNull();
  });
});

describe('buildReglementUrl', () => {
  it('construit le lien de téléchargement par partition, null si absente', () => {
    expect(buildReglementUrl('DU_200046977')).toBe(
      'https://www.geoportail-urbanisme.gouv.fr/document/download-by-partition/DU_200046977',
    );
    expect(buildReglementUrl(null)).toBeNull();
  });
});

describe('summarizePlu', () => {
  const base = { typezone: null, zoneLibelle: null, zoneDescription: null, documentType: null, documentName: null, dateValidite: null, reglementUrl: null, isRnu: false };
  it('note nulle => OK ; note présente => indisponible ; confiance moyenne', () => {
    expect(summarizePlu({ ...base, typezone: 'U', note: null })).toEqual({ status: 'OK', confidence: 'MOYENNE' });
    expect(summarizePlu({ ...base, note: 'RNU' })).toEqual({ status: 'UNAVAILABLE', confidence: 'MOYENNE' });
  });
});

describe('fetchPlu', () => {
  afterEach(() => vi.restoreAllMocks());

  function stub(routes: (url: string) => unknown) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = routes(url);
      if (body === 503) return new Response('', { status: 503 });
      return new Response(JSON.stringify(body), { status: 200 });
    }));
  }

  it('zone trouvée => OK avec type, libellé, document et lien règlement', async () => {
    stub((url) => {
      if (url.includes('/municipality')) return fc({ is_rnu: false, insee: '69385', name: 'LYON-5E' });
      if (url.includes('/zone-urba')) return fc({ typezone: 'U', libelle: 'UPp', libelong: 'desc', partition: 'DU_200046977', datvalid: '20260326' });
      if (url.includes('/document')) return fc({ du_type: 'PLUi', grid_title: 'PLUI GRAND LYON' });
      return fc(null);
    });
    const { data, transientError } = await fetchPlu({ lon: 4.8226, lat: 45.7626 });
    expect(transientError).toBe(false);
    expect(data.typezone).toBe('U');
    expect(data.zoneLibelle).toBe('UPp');
    expect(data.documentType).toBe('PLUi');
    expect(data.dateValidite).toBe('20260326');
    expect(data.reglementUrl).toContain('download-by-partition/DU_200046977');
    expect(data.note).toBeNull();
  });

  it('commune au RNU => indisponible avec note, sans zone', async () => {
    stub((url) => {
      if (url.includes('/municipality')) return fc({ is_rnu: true, name: 'PETIT VILLAGE' });
      return fc(null);
    });
    const { data } = await fetchPlu({ lon: 2, lat: 46 });
    expect(data.isRnu).toBe(true);
    expect(data.typezone).toBeNull();
    expect(data.note).toMatch(/RNU/i);
  });

  it('zonage non téléversé (zone-urba vide) => indisponible avec note (règle 3)', async () => {
    stub((url) => {
      if (url.includes('/municipality')) return fc({ is_rnu: false });
      return fc(null); // zone-urba et document vides
    });
    const { data } = await fetchPlu({ lon: 3, lat: 47 });
    expect(data.typezone).toBeNull();
    expect(data.note).toMatch(/disponible|couverture/i);
  });

  it('un 5xx marque transientError (à réessayer)', async () => {
    stub(() => 503);
    const { transientError } = await fetchPlu({ lon: 4.8226, lat: 45.7626 });
    expect(transientError).toBe(true);
  });

  it('zone récupérée mais /document en panne => zonage renvoyé (zone-urba fait foi, doc indisponible)', async () => {
    stub((url) => {
      if (url.includes('/municipality')) return fc({ is_rnu: false });
      if (url.includes('/zone-urba')) return fc({ typezone: 'U', libelle: 'UPp', partition: 'DU_1' });
      if (url.includes('/document')) return 503; // source molle décorative en panne
      return fc(null);
    });
    const { data, transientError } = await fetchPlu({ lon: 4.8, lat: 45.7 });
    expect(transientError).toBe(false);
    expect(data.typezone).toBe('U');
    expect(data.zoneLibelle).toBe('UPp');
    expect(data.documentType).toBeNull(); // donnée doc indisponible, jamais masquée par un défaut (règle 3)
  });

  it('zone-urba en panne => transientError même si les autres répondent (source primaire seule)', async () => {
    stub((url) => {
      if (url.includes('/zone-urba')) return 503;
      return fc({ is_rnu: false });
    });
    const { transientError } = await fetchPlu({ lon: 4.8, lat: 45.7 });
    expect(transientError).toBe(true);
  });
});
