'use client';

import { cn } from '../lib/cn';

export interface UnavailableStateProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Libellé de l'état vide (défaut « Donnée indisponible »). */
  label?: string;
  /**
   * Rappel déclenché au clic sur « Demander la donnée ». Si fourni, un bouton
   * de demande est rendu et le composant devient interactif.
   */
  onRequest?: () => void;
}

/**
 * UnavailableState (design-system §7) : matérialise l'état « donnée
 * indisponible » (règle inviolable n°3 : jamais de valeur par défaut
 * silencieuse). Bordure en pointillés, fond transparent, aucune valeur
 * fantôme. Le statut est porté par un libellé texte, jamais par la seule
 * couleur. Optionnellement, un bouton « Demander la donnée » (onRequest).
 */
export function UnavailableState({
  label = 'Donnée indisponible',
  onRequest,
  className,
  ...props
}: UnavailableStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-start gap-2 rounded-md border border-dashed border-neutral-300 bg-transparent p-4 text-sm text-neutral-500',
        className,
      )}
      {...props}
    >
      <span>{label}</span>
      {onRequest ? (
        <button
          type="button"
          onClick={onRequest}
          className={cn(
            'rounded-sm text-sm text-indigo-500 hover:underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          Demander la donnée
        </button>
      ) : null}
    </div>
  );
}
