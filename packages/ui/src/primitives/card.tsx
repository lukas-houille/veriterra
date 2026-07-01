import { cn } from '../lib/cn';

/**
 * Card, surface de contenu Veriterra (design-system §6).
 *
 * Composition façon shadcn : Card enveloppe CardHeader, CardTitle,
 * CardDescription, CardContent et CardFooter. Composant purement
 * présentationnel, donc utilisable en React Server Component (pas de
 * directive 'use client').
 *
 * Fidélité au design system :
 * - surface `bg-card`, texte `text-card-foreground`
 * - bordure `neutral-200`, rayon `lg` (12 px), ombre `sm`
 * - padding des sections 24 px (p-6, dans la plage 20-24 de la spec)
 */
export type CardProps = React.ComponentProps<'div'>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground border border-neutral-200 rounded-lg shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export type CardHeaderProps = React.ComponentProps<'div'>;

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export type CardTitleProps = React.ComponentProps<'h3'>;

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn('text-xl font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  );
}

export type CardDescriptionProps = React.ComponentProps<'p'>;

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export type CardContentProps = React.ComponentProps<'div'>;

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export type CardFooterProps = React.ComponentProps<'div'>;

export function CardFooter({ className, ...props }: CardFooterProps) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
