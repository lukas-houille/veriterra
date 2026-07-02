import type { EnrichmentBlockView, EnrichmentView } from './types';

// Logique de vue d'enrichissement, PURE (sans DB) donc testable. Les types attendus sont
// affichés même sans ligne en base (le worker crée le bloc quand il aboutit) : un type attendu
// sans bloc est présenté PENDING (préchargement non bloquant, US-1.4), ce qui pilote le polling.

/** Types d'enrichissement attendus sur la fiche, dans l'ordre d'affichage. */
export const EXPECTED_ENRICHMENT_TYPES = ['PRIX_DVF', 'RISQUES', 'PENTE', 'SERVICES', 'PLU'] as const;

function pendingBlock(type: string): EnrichmentBlockView {
  return {
    type,
    status: 'PENDING',
    source: null,
    sourceUrl: null,
    confidence: null,
    fetchedAt: null,
    data: null,
    error: null,
  };
}

/**
 * Fusionne les blocs existants avec la liste des types attendus : chaque type attendu apparaît
 * (bloc réel ou placeholder PENDING). `anyPending` reste vrai tant qu'un type attendu n'a pas
 * de statut terminal.
 */
export function buildEnrichmentView(existing: EnrichmentBlockView[]): EnrichmentView {
  const byType = new Map(existing.map((b) => [b.type, b]));
  const blocks = EXPECTED_ENRICHMENT_TYPES.map((type) => byType.get(type) ?? pendingBlock(type));
  return { blocks, anyPending: blocks.some((b) => b.status === 'PENDING') };
}
