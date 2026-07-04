import { cn } from '../lib/cn';

/** Statuts du pipeline de démarches (US-5.1, pins de carte). Les couleurs doivent égaler celles de
 *  `status.ts` côté app (frontière design-system : les deux tables sont tenues alignées à la main). */
export type PortfolioStatus =
  | 'à contacter'
  | 'à visiter'
  | 'visité'
  | 'démarches en cours'
  | 'sous compromis'
  | 'vendu'
  | 'écarté';

export interface StatusPinProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Statut du terrain dans le pipeline, qui pilote la couleur du marqueur. */
  status: PortfolioStatus;
}

/**
 * Couleur de chaque statut (halo = même teinte à 18% d'opacité). Appliquées en style inline pour
 * garder le point et son halo strictement sur la même couleur.
 */
const STATUS_COLOR: Record<PortfolioStatus, { hex: string; halo: string }> = {
  'à contacter': { hex: '#98a0b0', halo: 'rgba(152, 160, 176, 0.18)' },
  'à visiter': { hex: '#6366f1', halo: 'rgba(99, 102, 241, 0.18)' },
  visité: { hex: '#0891b2', halo: 'rgba(8, 145, 178, 0.18)' },
  'démarches en cours': { hex: '#db9b2c', halo: 'rgba(219, 155, 44, 0.18)' },
  'sous compromis': { hex: '#2e7d5b', halo: 'rgba(46, 125, 91, 0.18)' },
  vendu: { hex: '#78716c', halo: 'rgba(120, 113, 108, 0.18)' },
  écarté: { hex: '#c0432e', halo: 'rgba(192, 67, 46, 0.18)' },
};

/** Repli neutre pour un statut inconnu : ne jamais planter le rendu (règle 3). */
const FALLBACK_COLOR = { hex: '#98a0b0', halo: 'rgba(152, 160, 176, 0.18)' };

/**
 * StatusPin (design-system §7) : marqueur de carte matérialisant le statut d'un
 * terrain. Cercle de 13px à la couleur du statut, entouré d'un halo de 3px de la
 * même teinte à 18% d'opacité. Le statut n'est jamais porté par la seule couleur :
 * role="img" et aria-label le rendent lisibles aux technologies d'assistance.
 */
export function StatusPin({ status, className, style, ...props }: StatusPinProps) {
  const { hex, halo } = STATUS_COLOR[status] ?? FALLBACK_COLOR;

  return (
    <span
      role="img"
      aria-label={`Statut : ${status}`}
      className={cn('inline-block w-[13px] h-[13px] rounded-full', className)}
      style={{
        backgroundColor: hex,
        boxShadow: `0 0 0 3px ${halo}`,
        ...style,
      }}
      {...props}
    />
  );
}
