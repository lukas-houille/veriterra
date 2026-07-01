import { cn } from '../lib/cn';

/** Statuts de portefeuille (design-system §2, pins de carte). */
export type PortfolioStatus =
  | 'à étudier'
  | 'prometteur'
  | 'réservé'
  | 'écarté';

export interface StatusPinProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Statut du terrain dans le portefeuille, qui pilote la couleur du marqueur. */
  status: PortfolioStatus;
}

/**
 * Couleur de chaque statut (design-system §2, statuts portefeuille).
 * Le composant les applique en style inline pour garder le point et son halo
 * strictement sur la même teinte (halo = même couleur à 18% d'opacité).
 */
const STATUS_COLOR: Record<PortfolioStatus, { hex: string; halo: string }> = {
  'à étudier': { hex: '#98a0b0', halo: 'rgba(152, 160, 176, 0.18)' },
  prometteur: { hex: '#2e7d5b', halo: 'rgba(46, 125, 91, 0.18)' },
  réservé: { hex: '#db9b2c', halo: 'rgba(219, 155, 44, 0.18)' },
  écarté: { hex: '#c0432e', halo: 'rgba(192, 67, 46, 0.18)' },
};

/**
 * StatusPin (design-system §7) : marqueur de carte matérialisant le statut d'un
 * terrain. Cercle de 13px à la couleur du statut, entouré d'un halo de 3px de la
 * même teinte à 18% d'opacité. Le statut n'est jamais porté par la seule couleur :
 * role="img" et aria-label le rendent lisibles aux technologies d'assistance.
 */
export function StatusPin({ status, className, style, ...props }: StatusPinProps) {
  const { hex, halo } = STATUS_COLOR[status];

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
