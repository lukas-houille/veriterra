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

const allTerminal = (status: EnrichmentBlockView['status']) =>
  EXPECTED_ENRICHMENT_TYPES.map((type) => block({ type, status }));

describe('buildEnrichmentView', () => {
  it('présente chaque type attendu, en PENDING quand aucun bloc n\'existe encore', () => {
    const view = buildEnrichmentView([]);
    expect(view.blocks.map((b) => b.type)).toEqual([...EXPECTED_ENRICHMENT_TYPES]);
    expect(view.blocks.every((b) => b.status === 'PENDING')).toBe(true);
    expect(view.anyPending).toBe(true);
  });

  it('anyPending faux quand tous les types attendus ont un statut terminal', () => {
    expect(buildEnrichmentView(allTerminal('OK')).anyPending).toBe(false);
    expect(buildEnrichmentView(allTerminal('UNAVAILABLE')).anyPending).toBe(false);
    expect(buildEnrichmentView(allTerminal('ERROR')).anyPending).toBe(false);
  });

  it('anyPending vrai si un type attendu manque encore (reste PENDING)', () => {
    const view = buildEnrichmentView([block({ type: EXPECTED_ENRICHMENT_TYPES[0], status: 'OK' })]);
    expect(view.blocks).toHaveLength(EXPECTED_ENRICHMENT_TYPES.length);
    expect(view.anyPending).toBe(true);
  });
});
