import { cn } from '../lib/cn';

export type ConfidenceLevel = 'élevée' | 'moyenne' | 'faible';

export interface ConfidenceDotsProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Niveau de confiance à 3 crans (élevée = 3 points, moyenne = 2, faible = 1). */
  confidence: ConfidenceLevel;
  /** Affiche le libellé texte à côté des points (défaut true). Sinon, libellé en sr-only. */
  showLabel?: boolean;
}

/** Nombre de points remplis par niveau de confiance. */
const FILLED_BY_LEVEL: Record<ConfidenceLevel, number> = {
  élevée: 3,
  moyenne: 2,
  faible: 1,
};

const TOTAL_DOTS = 3;

/**
 * ConfidenceDots (design-system §7) : indice de confiance d'une donnée sourcée,
 * représenté par 3 points de 7px. Les points remplis (indigo-500) matérialisent
 * le niveau, les points vides (neutral-200) le reste. Le statut n'est jamais porté
 * par la seule couleur : un libellé texte est toujours présent (visible ou sr-only).
 */
export function ConfidenceDots({
  confidence,
  showLabel = true,
  className,
  ...props
}: ConfidenceDotsProps) {
  const filled = FILLED_BY_LEVEL[confidence];
  const label = `Confiance ${confidence}`;

  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <div
        role="img"
        aria-label={label}
        className="flex items-center gap-1"
      >
        {Array.from({ length: TOTAL_DOTS }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={cn(
              'w-[7px] h-[7px] rounded-full',
              index < filled ? 'bg-indigo-500' : 'bg-neutral-200',
            )}
          />
        ))}
      </div>
      {showLabel ? (
        <span className="text-xs text-neutral-500">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
