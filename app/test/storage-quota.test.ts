import { describe, expect, it } from 'vitest';
import { wouldExceedOrgQuota } from '@/lib/storage/s3';

// Cœur pur du quota de stockage par organisation (audit sécurité, finding LOW). Le calcul du total
// courant (aggregate RLS) et le garde vivent dans createDocument ; ici on teste la seule décision.
describe('wouldExceedOrgQuota', () => {
  it('illimité si quota <= 0 (quota désactivé)', () => {
    expect(wouldExceedOrgQuota(1e12, 1e9, 0)).toBe(false);
    expect(wouldExceedOrgQuota(1e12, 1e9, -1)).toBe(false);
  });

  it('faux sous le quota', () => {
    expect(wouldExceedOrgQuota(100, 50, 200)).toBe(false);
  });

  it('faux exactement au quota (borne incluse)', () => {
    expect(wouldExceedOrgQuota(150, 50, 200)).toBe(false);
  });

  it('vrai au-delà du quota', () => {
    expect(wouldExceedOrgQuota(150, 51, 200)).toBe(true);
  });
});
