// Types partagés d'enrichissement. Les payloads normalisés (sourcés) sont persistés dans
// EnrichmentBlock.data (colonne Json) et lus tels quels par l'app pour l'affichage. Importés
// par le worker (écriture) et par l'app (lecture/affichage), donc sans dépendance runtime ici.

/** Sévérité d'un risque, alignée sur AlertChip de @veriterra/ui. */
export type RiskSeverity = 'danger' | 'warning' | 'info' | 'success';

/** Un risque unitaire sourcé (une ligne du bloc RISQUES). */
export interface RiskItem {
  /** Clé stable pour le rendu et les tests. */
  key: 'argile' | 'inondation' | 'radon' | 'sismicite';
  /** Libellé lisible du risque. */
  label: string;
  /**
   * Valeur factuelle et sourcée (jamais un chiffre sec inventé). `null` uniquement quand la
   * source ne couvre pas ce risque (available = false), jamais une valeur par défaut.
   */
  value: string | null;
  /** Sévérité pour la mise en avant (null = neutre). */
  severity: RiskSeverity | null;
  /** false quand la source n'a rien renvoyé pour ce risque (donnée indisponible, règle 3). */
  available: boolean;
  /** Provenance (règle 1). */
  source: string;
  sourceUrl: string;
}

/** Payload du bloc d'enrichissement RISQUES (Géorisques). */
export interface RisquesData {
  items: RiskItem[];
}

/** Statut de synthèse d'un bloc, aligné sur l'enum Prisma EnrichmentStatus. */
export type BlockStatus = 'OK' | 'UNAVAILABLE' | 'ERROR';

/** Indice de confiance, aligné sur l'enum Prisma ConfidenceLevel. */
export type BlockConfidence = 'ELEVEE' | 'MOYENNE' | 'FAIBLE';
