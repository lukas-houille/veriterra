import { describe, expect, it } from 'vitest';
import { STATUS_COLORS, STATUS_LIST, TERRAIN_STATUSES, statusMeta } from '@/modules/terrains/status';

describe('vocabulaire de statut (US-5.1)', () => {
  it('expose les 7 états du pipeline dans l\'ordre', () => {
    expect(TERRAIN_STATUSES).toEqual([
      'A_CONTACTER',
      'A_VISITER',
      'VISITE',
      'DEMARCHES_EN_COURS',
      'SOUS_COMPROMIS',
      'VENDU',
      'ECARTE',
    ]);
    expect(STATUS_LIST.map((s) => s.key)).toEqual([...TERRAIN_STATUSES]);
    expect(STATUS_LIST.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('statusMeta renvoie le libellé et le pin d\'un statut connu', () => {
    const m = statusMeta('A_CONTACTER');
    expect(m.label).toBe('À contacter');
    expect(m.pin).toBe('à contacter');
    const v = statusMeta('VENDU');
    expect(v.label).toBe('Vendu');
  });

  it('statusMeta : statut inconnu => libellé = code brut, repli neutre (règle 3)', () => {
    const m = statusMeta('A_ETUDIER'); // ancien statut, plus dans l'enum
    expect(m.label).toBe('A_ETUDIER');
    expect(m.badge).toBe('neutral');
    expect(m.color).toBe('#98a0b0');
  });

  it('STATUS_COLORS couvre les 7 clés et concorde avec STATUS_LIST', () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...TERRAIN_STATUSES].sort());
    for (const s of STATUS_LIST) {
      expect(STATUS_COLORS[s.key]).toBe(s.color);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
