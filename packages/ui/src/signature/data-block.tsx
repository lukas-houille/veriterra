import { cn } from '../lib/cn';
import { ConfidenceDots, type ConfidenceLevel } from './confidence-dots';
import { UnavailableState } from './unavailable-state';

export interface DataBlockProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Intitulé de la donnée, rendu en capitales. Ex. « Prix au m² ». */
  label: string;
  /** Valeur affichée en police de données (mono). Ex. « 3 240 € ». */
  value: string;
  /** Tendance optionnelle rendue à côté de la valeur. Vert si « + », rouge si « - ». Ex. « +4,2% ». */
  trend?: string;
  /** Source de la donnée, rendue en mono. Ex. « DVF ». */
  source: string;
  /** Date ou période de la donnée. Ex. « 03/2025 ». */
  date: string;
  /** Indice de confiance à 3 crans, matérialisé par ConfidenceDots. */
  confidence: ConfidenceLevel;
  /** Bascule l'état « donnée indisponible » : ni valeur ni meta ne sont rendues. */
  unavailable?: boolean;
}

/**
 * Couleur de la tendance selon son signe. Le signe textuel (+/-) reste présent,
 * la couleur ne porte donc jamais seule l'information (accessibilité).
 */
function trendColor(trend: string): string {
  const first = trend.trim().charAt(0);
  if (first === '+') return 'text-success';
  if (first === '-') return 'text-danger';
  return 'text-neutral-500';
}

/**
 * DataBlock (design-system §7) : bloc de donnée sourcée, brique centrale de Veriterra.
 * Chaque valeur affiche sa source, sa date et son indice de confiance ; aucun chiffre
 * n'est orphelin. Quand la donnée est indisponible, on rend UnavailableState à la place
 * de la valeur et de la meta, jamais une valeur fantôme.
 */
export function DataBlock({
  label,
  value,
  trend,
  source,
  date,
  confidence,
  unavailable = false,
  className,
  ...props
}: DataBlockProps) {
  return (
    <div
      className={cn(
        'bg-card border border-neutral-200 rounded-lg shadow-sm p-4',
        className,
      )}
      {...props}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>

      {unavailable ? (
        <div className="mt-2">
          <UnavailableState />
        </div>
      ) : (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl text-neutral-900">{value}</span>
            {trend ? (
              <span className={cn('font-mono text-sm', trendColor(trend))}>
                {trend}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
            <span className="font-mono text-xs text-neutral-500">
              {source} · {date}
            </span>
            <ConfidenceDots confidence={confidence} showLabel={false} />
          </div>
        </>
      )}
    </div>
  );
}
