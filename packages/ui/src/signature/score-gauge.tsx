import { cn } from '../lib/cn';

export interface ScoreGaugeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Score à afficher, borné (clampé) dans l'intervalle 0 à 100. */
  value: number;
  /** Diamètre de la jauge en pixels (défaut 140, autre taille de référence 72). */
  size?: number;
}

/** Épaisseur de la piste et de l'arc, en pixels (design-system §7). */
const STROKE_WIDTH = 7;
/** Rapport taille de police du chiffre central sur diamètre (38 pour 140). */
const NUMBER_RATIO = 38 / 140;

/** Borne une valeur numérique dans l'intervalle 0 à 100. */
function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * ScoreGauge (design-system §7) : jauge de score de 0 à 100 en anneau SVG.
 * La piste (neutral-100) est complète, l'arc (indigo-500) couvre value/100 du
 * périmètre, extrémité arrondie, départ en haut (-90°). Le chiffre central
 * (font-extrabold, neutral-900) et le « / 100 » (font-mono, neutral-500)
 * restituent la valeur en clair. La valeur passée est bornée à 0 à 100.
 */
export function ScoreGauge({
  value,
  size = 140,
  className,
  ...props
}: ScoreGaugeProps) {
  const score = clampScore(value);
  const rounded = Math.round(score);

  const center = size / 2;
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  const numberSize = size * NUMBER_RATIO;

  return (
    <div
      role="img"
      aria-label={`Score ${rounded} sur 100`}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          className="stroke-neutral-100"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="stroke-indigo-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-extrabold text-neutral-900 tabular-nums"
          style={{ fontSize: numberSize }}
        >
          {rounded}
        </span>
        <span className="font-mono text-neutral-500 text-xs mt-1">/ 100</span>
      </div>
    </div>
  );
}
