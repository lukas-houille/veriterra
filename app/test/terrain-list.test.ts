import { describe, expect, it } from 'vitest';
import {
  filterTerrains,
  prixM2,
  sortTerrains,
  type TerrainListItem,
} from '@/modules/terrains/terrain-list';

function item(over: Partial<TerrainListItem> & { id: string }): TerrainListItem {
  return {
    label: over.label ?? over.id,
    address: over.address ?? 'Lyon',
    status: over.status ?? 'A_ETUDIER',
    prixDemande: over.prixDemande ?? null,
    surfaceTotaleM2: over.surfaceTotaleM2 ?? 500,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('prixM2', () => {
  it('dérive le prix au m², null si prix absent ou surface nulle (jamais 0)', () => {
    expect(prixM2({ prixDemande: 100000, surfaceTotaleM2: 500 })).toBe(200);
    expect(prixM2({ prixDemande: null, surfaceTotaleM2: 500 })).toBeNull();
    expect(prixM2({ prixDemande: 100000, surfaceTotaleM2: 0 })).toBeNull();
  });
});

describe('filterTerrains', () => {
  const rows = [
    item({ id: 'a', label: 'Terrain Nord', address: '3 rue des Écoles, Décines' }),
    item({ id: 'b', label: 'Parcelle Sud', address: '5 avenue Lyon' }),
  ];
  it('renvoie tout pour une requête vide', () => {
    expect(filterTerrains(rows, '   ').map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('filtre sur le libellé et l\'adresse, insensible à la casse et aux accents', () => {
    expect(filterTerrains(rows, 'nord').map((r) => r.id)).toEqual(['a']);
    expect(filterTerrains(rows, 'ECOLES').map((r) => r.id)).toEqual(['a']); // accent-insensible
    expect(filterTerrains(rows, 'lyon').map((r) => r.id)).toEqual(['b']);
    expect(filterTerrains(rows, 'xyz')).toEqual([]);
  });
});

describe('sortTerrains', () => {
  const rows = [
    item({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z', surfaceTotaleM2: 400, prixDemande: 200000 }), // 500 €/m²
    item({ id: 'mid', createdAt: '2026-03-01T00:00:00.000Z', surfaceTotaleM2: 1000, prixDemande: 300000 }), // 300 €/m²
    item({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z', surfaceTotaleM2: 600, prixDemande: null }), // prix absent
  ];

  it('récents : plus récent d\'abord', () => {
    expect(sortTerrains(rows, 'recent').map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });
  it('score : plus haut d\'abord, non évalué (null) en fin (règle 3)', () => {
    const scored = [item({ id: 'a', score: 60 }), item({ id: 'b', score: 85 }), item({ id: 'c', score: null })];
    expect(sortTerrains(scored, 'score').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('surface : plus grande d\'abord', () => {
    expect(sortTerrains(rows, 'surface').map((r) => r.id)).toEqual(['mid', 'new', 'old']);
  });
  it('prix total : plus haut d\'abord, prix absent en fin (règle 3)', () => {
    expect(sortTerrains(rows, 'prixTotal').map((r) => r.id)).toEqual(['mid', 'old', 'new']);
  });
  it('prix au m² : plus élevé d\'abord, sans prix en fin (jamais trié comme 0)', () => {
    // old = 500 €/m², mid = 300 €/m², new = indisponible => en fin
    expect(sortTerrains(rows, 'prixM2').map((r) => r.id)).toEqual(['old', 'mid', 'new']);
  });
  it('ne mute pas le tableau source', () => {
    const before = rows.map((r) => r.id);
    sortTerrains(rows, 'surface');
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
