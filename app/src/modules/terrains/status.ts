import type { BadgeProps, PortfolioStatus } from '@veriterra/ui';

// SOURCE UNIQUE du vocabulaire de statut (US-5.1). Le pipeline de démarches à 7 états, dans l'ordre :
// À contacter -> À visiter -> Visité -> Démarches en cours -> Sous compromis -> Vendu / Écarté.
// Une seule table pilote : le libellé, le pin (StatusPin), la teinte du Badge, l'ordre, et la COULEUR
// (hex, réutilisée par les pins de carte via map-style). La liste des clés admissibles (allowlist
// serveur `TERRAIN_STATUSES`) en dérive aussi. Module client-safe (aucune dépendance serveur).

/** Clés du statut, dans l'ordre du pipeline (aligné sur l'enum Prisma `TerrainStatus`). */
export const TERRAIN_STATUSES = [
  'A_CONTACTER',
  'A_VISITER',
  'VISITE',
  'DEMARCHES_EN_COURS',
  'SOUS_COMPROMIS',
  'VENDU',
  'ECARTE',
] as const;

export type TerrainStatusValue = (typeof TERRAIN_STATUSES)[number];
/** Alias historique (les consommateurs existants importaient `PortfolioStatusKey`). */
export type PortfolioStatusKey = TerrainStatusValue;

export interface StatusMeta {
  key: TerrainStatusValue;
  /** Libellé français lisible, ex. « À contacter ». */
  label: string;
  /** Statut attendu par StatusPin (@veriterra/ui), ex. « à contacter ». */
  pin: PortfolioStatus;
  /** Teinte sémantique du Badge (@veriterra/ui). */
  badge: NonNullable<BadgeProps['variant']>;
  /** Couleur hex du statut (pins de carte, doit égaler celle de StatusPin). */
  color: string;
  /** Ordre d'affichage stable (menu, chips, tris) = position dans le pipeline. */
  order: number;
}

const STATUS: Record<TerrainStatusValue, StatusMeta> = {
  A_CONTACTER: { key: 'A_CONTACTER', label: 'À contacter', pin: 'à contacter', badge: 'neutral', color: '#98a0b0', order: 0 },
  A_VISITER: { key: 'A_VISITER', label: 'À visiter', pin: 'à visiter', badge: 'info', color: '#6366f1', order: 1 },
  VISITE: { key: 'VISITE', label: 'Visité', pin: 'visité', badge: 'info', color: '#0891b2', order: 2 },
  DEMARCHES_EN_COURS: { key: 'DEMARCHES_EN_COURS', label: 'Démarches en cours', pin: 'démarches en cours', badge: 'warning', color: '#db9b2c', order: 3 },
  SOUS_COMPROMIS: { key: 'SOUS_COMPROMIS', label: 'Sous compromis', pin: 'sous compromis', badge: 'success', color: '#2e7d5b', order: 4 },
  VENDU: { key: 'VENDU', label: 'Vendu', pin: 'vendu', badge: 'neutral', color: '#78716c', order: 5 },
  ECARTE: { key: 'ECARTE', label: 'Écarté', pin: 'écarté', badge: 'danger', color: '#c0432e', order: 6 },
};

const FALLBACK: StatusMeta = STATUS.A_CONTACTER;

/**
 * Métadonnées d'un statut stocké (enum). Pour une valeur INCONNUE (enum étendu sans mise à jour ici),
 * on affiche le code brut en libellé plutôt que de le masquer silencieusement (règle 3), pin/badge
 * neutres, couleur de repli.
 */
export function statusMeta(status: string): StatusMeta {
  return STATUS[status as TerrainStatusValue] ?? { ...FALLBACK, label: status };
}

/** Tous les statuts, dans l'ordre du pipeline (menu, chips, légendes). */
export const STATUS_LIST: StatusMeta[] = Object.values(STATUS).sort((a, b) => a.order - b.order);

/** Couleur hex par clé de statut (pins MapLibre du dashboard). Dérivée de la table ci-dessus. */
export const STATUS_COLORS: Record<TerrainStatusValue, string> = Object.fromEntries(
  STATUS_LIST.map((m) => [m.key, m.color]),
) as Record<TerrainStatusValue, string>;
