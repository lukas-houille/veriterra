import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from '../src/primitives/button.js';

describe('Button', () => {
  it('rend un bouton avec son libellé', () => {
    render(<Button>Ouvrir la fiche</Button>);
    const btn = screen.getByRole('button', { name: 'Ouvrir la fiche' });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('applique la variante par défaut (primaire indigo)', () => {
    render(<Button>Ouvrir</Button>);
    const btn = screen.getByRole('button', { name: 'Ouvrir' });
    expect(btn).toHaveClass('bg-primary', 'text-primary-foreground', 'h-10');
  });

  it('applique la variante secondary', () => {
    render(<Button variant="secondary">Comparer</Button>);
    const btn = screen.getByRole('button', { name: 'Comparer' });
    expect(btn).toHaveClass('bg-white', 'border-neutral-200', 'text-indigo-700');
  });

  it('applique la variante ghost', () => {
    render(<Button variant="ghost">Ajouter au portefeuille</Button>);
    const btn = screen.getByRole('button', {
      name: 'Ajouter au portefeuille',
    });
    expect(btn).toHaveClass('bg-transparent', 'text-indigo-500');
  });

  it('applique la variante destructive avec sa bordure', () => {
    render(<Button variant="destructive">Écarter</Button>);
    const btn = screen.getByRole('button', { name: 'Écarter' });
    expect(btn).toHaveClass('bg-danger-bg', 'text-danger', 'border-[#eac3b9]');
  });

  it('gère les tailles sm, default et lg', () => {
    const { rerender } = render(<Button size="sm">A</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-8');
    rerender(<Button size="lg">A</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-12');
  });

  it('expose un focus visible et l\'état désactivé', () => {
    render(<Button disabled>Indisponible</Button>);
    const btn = screen.getByRole('button', { name: 'Indisponible' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
      'disabled:pointer-events-none',
    );
  });

  it('rend l\'enfant fourni via asChild (composition Slot)', () => {
    render(
      <Button asChild variant="ghost">
        <a href="/portefeuille">Voir le portefeuille</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Voir le portefeuille' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveClass('text-indigo-500');
  });

  it('expose buttonVariants comme fabrique de classes', () => {
    expect(typeof buttonVariants).toBe('function');
    expect(buttonVariants({ variant: 'default' })).toContain('bg-primary');
  });
});
