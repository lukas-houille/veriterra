import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Badge : pilule de statut (design system Veriterra, section 6).
 * Fond = teinte sémantique, texte = couleur foncée associée.
 * Rappel accessibilite : un statut ne doit jamais reposer sur la seule
 * couleur, prevoir un libelle textuel dans le contenu du badge.
 */
export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        neutral: 'bg-neutral-100 text-neutral-700',
        success: 'bg-success-bg text-success',
        warning: 'bg-warning-bg text-amber-700',
        danger: 'bg-danger-bg text-danger',
        info: 'bg-info-bg text-info',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
