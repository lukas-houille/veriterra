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

/** Une vente de terrain comparable (DVF), pour la transparence des chiffres (règle 1). */
export interface DvfComparable {
  date: string; // AAAA-MM-JJ
  prixM2: number; // euros par m²
  surfaceM2: number;
  valeur: number; // valeur foncière totale de la mutation
}

/** Payload du bloc PRIX_DVF. Valeurs nulles = pas d'estimation possible (voir `note`, règle 3). */
export interface PrixDvfData {
  estimationM2: number | null; // médiane €/m² des ventes de terrain du secteur
  fourchetteBasseM2: number | null; // 1er quartile
  fourchetteHauteM2: number | null; // 3e quartile
  nbComparables: number;
  dernieresVentes: DvfComparable[];
  /** Raison d'indisponibilité (hors couverture, comparables insuffisants), jamais un chiffre inventé. */
  note: string | null;
}

/** Payload du bloc PENTE (topographie dérivée du RGE ALTI). Valeurs nulles = indisponible (règle 3). */
export interface PenteData {
  /** Altitude au centre de la parcelle (m), arrondie. */
  altitudeM: number | null;
  /** Pente en pourcentage (dénivelé / distance horizontale). */
  pentePct: number | null;
  /** Pente en degrés. */
  penteDeg: number | null;
  /** Exposition (direction vers laquelle le terrain descend) : "Sud", "Sud-Ouest"… ou null si plat. */
  expositionLabel: string | null;
  /** Cap boussole de l'exposition (0 = Nord, sens horaire), null si terrain plat ou indisponible. */
  expositionBearingDeg: number | null;
  /** Raison d'indisponibilité (hors couverture RGE ALTI), jamais un chiffre inventé. */
  note: string | null;
}

/** Une catégorie de service de proximité (OSM), avec distance au plus proche et nombre dans le rayon. */
export interface ServiceItem {
  key: 'ecoles' | 'commerces' | 'transports';
  label: string;
  /** Distance (m) au plus proche, ou null si aucun dans le rayon (réponse réelle, pas indisponible). */
  nearestM: number | null;
  /** Nombre trouvé dans le rayon. */
  count: number;
}

/** Payload du bloc SERVICES (proximité, OpenStreetMap). Un rayon fixe, une entrée par catégorie. */
export interface ServicesData {
  /** Rayon de recherche en mètres. */
  radiusM: number;
  items: ServiceItem[];
  /** Raison d'indisponibilité de la source (jamais un "0" silencieux : "aucun dans le rayon" vit dans items). */
  note: string | null;
}

/** Statut de synthèse d'un bloc, aligné sur l'enum Prisma EnrichmentStatus. */
export type BlockStatus = 'OK' | 'UNAVAILABLE' | 'ERROR';

/** Indice de confiance, aligné sur l'enum Prisma ConfidenceLevel. */
export type BlockConfidence = 'ELEVEE' | 'MOYENNE' | 'FAIBLE';
