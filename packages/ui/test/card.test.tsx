import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../src/primitives/card.js';

describe('Card', () => {
  it('rend la composition complète sans crash', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Parcelle AB 42</CardTitle>
          <CardDescription>Synthèse de la parcelle sélectionnée</CardDescription>
        </CardHeader>
        <CardContent>Surface 1 240 m²</CardContent>
        <CardFooter>Ouvrir la fiche</CardFooter>
      </Card>,
    );

    expect(screen.getByText('Parcelle AB 42')).toBeInTheDocument();
    expect(screen.getByText('Synthèse de la parcelle sélectionnée')).toBeInTheDocument();
    expect(screen.getByText('Surface 1 240 m²')).toBeInTheDocument();
    expect(screen.getByText('Ouvrir la fiche')).toBeInTheDocument();
  });

  it('applique les tokens de surface du design system sur la racine', () => {
    const { container } = render(<Card>Contenu</Card>);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass(
      'bg-card',
      'text-card-foreground',
      'border',
      'border-neutral-200',
      'rounded-lg',
      'shadow-sm',
    );
  });

  it('rend CardTitle comme un h3 stylé titre', () => {
    render(<CardTitle>Titre</CardTitle>);
    const title = screen.getByRole('heading', { level: 3, name: 'Titre' });

    expect(title).toHaveClass('text-xl', 'font-semibold');
  });

  it('rend CardDescription en texte atténué', () => {
    render(<CardDescription>Aide</CardDescription>);

    expect(screen.getByText('Aide')).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('fusionne className et étale les props HTML sur la racine', () => {
    render(
      <Card className="mt-4" data-testid="carte" aria-label="Fiche parcelle">
        x
      </Card>,
    );
    const root = screen.getByTestId('carte');

    expect(root).toHaveClass('mt-4', 'bg-card');
    expect(root).toHaveAttribute('aria-label', 'Fiche parcelle');
  });
});
