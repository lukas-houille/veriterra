import { describe, expect, it } from 'vitest';
import { normalizeParcelleFeature, parseIdu } from '@/lib/geo/apicarto';

describe('parseIdu', () => {
  it('découpe un IDU en insee / préfixe / section / numéro', () => {
    expect(parseIdu('69381000AA0001')).toEqual({
      insee: '69381',
      prefixe: '000',
      section: 'AA',
      numero: '0001',
    });
  });

  it('rejette un IDU de mauvaise longueur', () => {
    expect(() => parseIdu('123')).toThrow();
  });
});

describe('normalizeParcelleFeature', () => {
  it('normalise une feature API Carto (surface arrondie, source tracée)', () => {
    const parcelle = normalizeParcelleFeature(
      {
        properties: {
          idu: '69381000AA0001',
          section: 'AA',
          numero: '0001',
          nom_com: 'Lyon',
          contenance: 512.7,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
      '69381000AA0001',
    );
    expect(parcelle.idu).toBe('69381000AA0001');
    expect(parcelle.commune).toBe('Lyon');
    expect(parcelle.surfaceM2).toBe(513);
    expect(parcelle.source).toContain('API Carto');
    expect(parcelle.geojson.type).toBe('Polygon');
  });

  it('retombe sur l\'IDU fourni quand la feature ne le porte pas', () => {
    const parcelle = normalizeParcelleFeature(
      { properties: { contenance: 100 }, geometry: { type: 'Polygon', coordinates: [] } },
      '69382000BB0002',
    );
    expect(parcelle.idu).toBe('69382000BB0002');
  });
});
