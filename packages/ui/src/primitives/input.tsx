'use client';

import { cn } from '../lib/cn';

export type InputProps = React.ComponentProps<'input'>;

/**
 * Champ de saisie de base du design system Veriterra (§6).
 *
 * Bordure neutre, fond blanc, rayon `md`. Anneau de focus `indigo-400` (via
 * `ring-ring`) et bordure accentuée au focus. Lorsque `aria-invalid` vaut
 * `true`, la bordure passe en `danger` pour signaler l'erreur.
 *
 * En React 19, `ref` est un prop normal : il est simplement étalé avec le reste
 * des props sur l'élément `<input>` racine.
 */
export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground',
        'placeholder:text-neutral-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-indigo-400',
        'aria-[invalid=true]:border-danger',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
