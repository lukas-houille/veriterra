import { render, screen } from '@testing-library/react';
import { DataBlock } from '../src/signature/data-block.js';

describe('DataBlock', () => {
  it('rend label, valeur, source et date sans crash', () => {
    render(
      <DataBlock
        label="Prix au m²"
        value="3 240 €"
        trend="+4,2%"
        source="DVF"
        date="03/2025"
        confidence="élevée"
      />,
    );

    expect(screen.getByText('Prix au m²')).toBeInTheDocument();
    expect(screen.getByText('3 240 €')).toBeInTheDocument();
    expect(screen.getByText('DVF · 03/2025')).toBeInTheDocument();
    // ConfidenceDots reste accessible même sans libellé visible.
    expect(
      screen.getByRole('img', { name: 'Confiance élevée' }),
    ).toBeInTheDocument();
  });

  it('colore la tendance en vert quand elle commence par +', () => {
    render(
      <DataBlock
        label="Prix au m²"
        value="3 240 €"
        trend="+4,2%"
        source="DVF"
        date="03/2025"
        confidence="moyenne"
      />,
    );

    expect(screen.getByText('+4,2%')).toHaveClass('text-success');
  });

  it('colore la tendance en rouge quand elle commence par -', () => {
    render(
      <DataBlock
        label="Prix au m²"
        value="2 980 €"
        trend="-1,5%"
        source="DVF"
        date="03/2025"
        confidence="faible"
      />,
    );

    expect(screen.getByText('-1,5%')).toHaveClass('text-danger');
  });

  it('rend la valeur en police de données (mono)', () => {
    render(
      <DataBlock
        label="Surface"
        value="1 240 m²"
        source="Cadastre"
        date="2024"
        confidence="élevée"
      />,
    );

    expect(screen.getByText('1 240 m²')).toHaveClass('font-mono');
  });

  it('bascule en état indisponible : ni valeur ni meta fantôme', () => {
    render(
      <DataBlock
        label="Prix au m²"
        value="3 240 €"
        source="DVF"
        date="03/2025"
        confidence="élevée"
        unavailable
      />,
    );

    // La valeur et la meta ne doivent pas être rendues.
    expect(screen.queryByText('3 240 €')).not.toBeInTheDocument();
    expect(screen.queryByText('DVF · 03/2025')).not.toBeInTheDocument();
    // Le label reste affiché.
    expect(screen.getByText('Prix au m²')).toBeInTheDocument();
  });

  it('applique les tokens Card et étale les props HTML sur la racine', () => {
    render(
      <DataBlock
        label="Surface"
        value="1 240 m²"
        source="Cadastre"
        date="2024"
        confidence="moyenne"
        className="mt-4"
        data-testid="bloc"
        aria-label="Bloc surface"
      />,
    );
    const root = screen.getByTestId('bloc');

    expect(root).toHaveClass(
      'bg-card',
      'border',
      'border-neutral-200',
      'rounded-lg',
      'shadow-sm',
      'mt-4',
    );
    expect(root).toHaveAttribute('aria-label', 'Bloc surface');
  });
});
