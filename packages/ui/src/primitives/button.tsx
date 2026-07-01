'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Variantes du bouton Veriterra (design-system.md, section 6).
 * Mappe les variantes shadcn sur les tokens de marque indigo.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold ' +
    'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Primaire : fond indigo-500 (bg-primary), texte blanc, hover indigo-600.
        default: 'bg-primary text-primary-foreground hover:bg-indigo-600',
        // Secondaire : fond blanc, bordure neutral-200, texte indigo-700, hover neutral-50.
        secondary:
          'bg-white border border-neutral-200 text-indigo-700 hover:bg-neutral-50',
        // Ghost : transparent, texte indigo-500, hover fond indigo-50.
        ghost: 'bg-transparent text-indigo-500 hover:bg-indigo-50',
        // Destructive : fond danger clair, texte danger, bordure #EAC3B9.
        destructive:
          'bg-danger-bg text-danger border border-[#eac3b9] hover:bg-danger-bg/80',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        default: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Rend le composant comme son unique enfant (composition Radix Slot). */
  asChild?: boolean;
}

/**
 * Bouton d'action de l'interface Veriterra.
 * Utilise `asChild` pour composer avec un lien ou tout autre élément.
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
