import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from '../src/primitives/badge.js';

describe('Badge', () => {
  it('rend son contenu textuel sans crash', () => {
    render(<Badge>Prometteur</Badge>);
    expect(screen.getByText('Prometteur')).toBeInTheDocument();
  });

  it('applique la pilule de base (rounded-full, taille sm)', () => {
    render(<Badge>Reserve</Badge>);
    const el = screen.getByText('Reserve');
    expect(el).toHaveClass('rounded-full', 'text-xs', 'font-semibold');
  });

  it('utilise la variante neutral par defaut', () => {
    render(<Badge>Neutre</Badge>);
    const el = screen.getByText('Neutre');
    expect(el).toHaveClass('bg-neutral-100', 'text-neutral-700');
  });

  it.each([
    ['success', 'bg-success-bg', 'text-success'],
    ['warning', 'bg-warning-bg', 'text-amber-700'],
    ['danger', 'bg-danger-bg', 'text-danger'],
    ['info', 'bg-info-bg', 'text-info'],
  ] as const)('applique les classes de la variante %s', (variant, bg, fg) => {
    render(<Badge variant={variant}>Statut</Badge>);
    const el = screen.getByText('Statut');
    expect(el).toHaveClass(bg, fg);
  });

  it('etale les props (className, aria) sur le span racine', () => {
    render(
      <Badge className="ml-2" aria-label="Ecarte">
        X
      </Badge>,
    );
    const el = screen.getByLabelText('Ecarte');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveClass('ml-2');
  });

  it('expose badgeVariants comme helper de classes', () => {
    expect(badgeVariants({ variant: 'danger' })).toContain('bg-danger-bg');
  });
});
