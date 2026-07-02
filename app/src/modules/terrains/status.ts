import type { BadgeProps, PortfolioStatus } from '@veriterra/ui';

// Source unique des statuts portefeuille (design-system §2). Auparavant redéfinis à trois
// endroits (dashboard, tableau, fiche) en hex inline et en variants divergents. Une seule
// table (libellé lisible, statut StatusPin, variant Badge, ordre d'affichage). Consommée par
// la fiche dès maintenant ; la bascule des pilules hex du dashboard et du tableau vers cette
// source (via Badge/StatusPin) se fait dans la slice suivante (PR2).

export type PortfolioStatusKey = 'A_ETUDIER' | 'PROMETTEUR' | 'RESERVE' | 'ECARTE';

export interface StatusMeta {
  key: PortfolioStatusKey;
  /** Libellé français lisible, ex. « À étudier ». */
  label: string;
  /** Statut attendu par StatusPin (@veriterra/ui), ex. « à étudier ». */
  pin: PortfolioStatus;
  /** Teinte sémantique du Badge (@veriterra/ui). */
  badge: NonNullable<BadgeProps['variant']>;
  /** Ordre d'affichage stable (chips, tris). */
  order: number;
}

const STATUS: Record<PortfolioStatusKey, StatusMeta> = {
  A_ETUDIER: { key: 'A_ETUDIER', label: 'À étudier', pin: 'à étudier', badge: 'neutral', order: 0 },
  PROMETTEUR: { key: 'PROMETTEUR', label: 'Prometteur', pin: 'prometteur', badge: 'success', order: 1 },
  RESERVE: { key: 'RESERVE', label: 'Réservé', pin: 'réservé', badge: 'warning', order: 2 },
  ECARTE: { key: 'ECARTE', label: 'Écarté', pin: 'écarté', badge: 'danger', order: 3 },
};

const FALLBACK: StatusMeta = STATUS.A_ETUDIER;

/**
 * Métadonnées d'un statut stocké (enum). Pour une valeur INCONNUE (enum étendu sans mise à
 * jour ici), on affiche le code brut en libellé plutôt que de le masquer en « À étudier »
 * silencieux (règle 3), avec pin et badge neutres.
 */
export function statusMeta(status: string): StatusMeta {
  return STATUS[status as PortfolioStatusKey] ?? { ...FALLBACK, label: status };
}
