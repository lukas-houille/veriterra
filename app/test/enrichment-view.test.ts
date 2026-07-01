import { describe, expect, it } from 'vitest';
import { EXPECTED_ENRICHMENT_TYPES, buildEnrichmentView } from '@/modules/terrains/enrichment-view';
import type { EnrichmentBlockView } from '@/modules/terrains/types';

function block(overrides: Partial<EnrichmentBlockView>): EnrichmentBlockView {
  return {
    type: 'RISQUES',
    status: 'OK',
    source: 'Géorisques',
    sourceUrl: null,
    confidence: 'ELEVEE',
    fetchedAt: null,
    data: null,
    error: null,
    ...overrides,
  };
}

describe('buildEnrichmentView', () => {
  it('présente chaque type attendu, en PENDING quand aucun bloc n\'existe encore', () => {
    const view = buildEnrichmentView([]);
    expect(view.blocks.map((b) => b.type)).toEqual([...EXPECTED_ENRICHMENT_TYPES]);
    expect(view.blocks.every((b) => b.status === 'PENDING')).toBe(true);
    expect(view.anyPending).toBe(true);
  });

  it('utilise le bloc existant pour un type attendu (statut terminal => pas de pending)', () => {
    const view = buildEnrichmentView([block({ type: 'RISQUES', status: 'OK' })]);
    expect(view.blocks).toHaveLength(EXPECTED_ENRICHMENT_TYPES.length);
    expect(view.blocks[0]?.status).toBe('OK');
    expect(view.anyPending).toBe(false);
  });

  it('UNAVAILABLE et ERROR sont terminaux (anyPending faux)', () => {
    expect(buildEnrichmentView([block({ status: 'UNAVAILABLE' })]).anyPending).toBe(false);
    expect(buildEnrichmentView([block({ status: 'ERROR', error: 'x' })]).anyPending).toBe(false);
  });
});
