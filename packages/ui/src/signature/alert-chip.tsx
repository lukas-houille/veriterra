import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type AlertChipSeverity = 'danger' | 'warning' | 'info' | 'success';

export interface AlertChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Gravité de l'alerte. Détermine les couleurs et le préfixe accessible. */
  severity: AlertChipSeverity;
  /** Contenu factuel et sourcé (ex. « Risque inondation, aléa fort, PPRi 2021 »). */
  children: ReactNode;
}

/** Palette par gravité (fidèle à design-system.md §2 sémantiques et §7 AlertChip). */
const STYLES_BY_SEVERITY: Record<
  AlertChipSeverity,
  { chip: string; dot: string; prefix: string }
> = {
  danger: {
    chip: 'bg-[#f8e7e2] text-[#c0432e] border-[#eac3b9]',
    dot: 'bg-[#c0432e]',
    prefix: 'Alerte',
  },
  warning: {
    chip: 'bg-[#fbf2dd] text-[#8a5e10] border-[#ecd7a2]',
    dot: 'bg-[#db9b2c]',
    prefix: 'À vérifier',
  },
  info: {
    chip: 'bg-[#e6f0f5] text-[#2f6e8f] border-[#bcd6e2]',
    dot: 'bg-[#2f6e8f]',
    prefix: 'Information',
  },
  success: {
    chip: 'bg-[#e7f2ec] text-[#2e7d5b] border-[#bfe0cd]',
    dot: 'bg-[#2e7d5b]',
    prefix: 'Validé',
  },
};

/**
 * AlertChip (design-system §7) : pilule d'alerte factuelle et sourcée.
 * Le point de couleur signale la gravité, le libellé (children) porte toujours
 * l'information vérifiable (ex. « Risque inondation, aléa fort, PPRi 2021 »).
 *
 * Accessibilité : la gravité n'est jamais transmise par la seule couleur. Le point
 * est décoratif (aria-hidden) et un préfixe textuel (sr-only) précise la gravité
 * pour les lecteurs d'écran, en plus du contenu factuel visible.
 */
export function AlertChip({
  severity,
  children,
  className,
  ...props
}: AlertChipProps) {
  const style = STYLES_BY_SEVERITY[severity];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        style.chip,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('w-[7px] h-[7px] shrink-0 rounded-full', style.dot)}
      />
      <span className="sr-only">{style.prefix} : </span>
      <span>{children}</span>
    </span>
  );
}
