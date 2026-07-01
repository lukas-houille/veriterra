import { render, screen } from '@testing-library/react';
import { AlertChip } from '../src/signature/alert-chip.js';

describe('AlertChip', () => {
  it('se rend sans crash et affiche le contenu factuel', () => {
    render(<AlertChip severity="danger">Risque inondation, aléa fort, PPRi 2021</AlertChip>);
    expect(
      screen.getByText('Risque inondation, aléa fort, PPRi 2021'),
    ).toBeInTheDocument();
  });

  it('applique les couleurs de la variante danger et un point décoratif', () => {
    const { container } = render(<AlertChip severity="danger">Écarté</AlertChip>);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.className).toContain('bg-[#f8e7e2]');
    expect(chip.className).toContain('text-[#c0432e]');
    const dot = container.querySelector('.bg-\\[\\#c0432e\\]');
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('applique les couleurs de la variante warning', () => {
    const { container } = render(<AlertChip severity="warning">Servitude à vérifier</AlertChip>);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.className).toContain('bg-[#fbf2dd]');
    expect(chip.className).toContain('text-[#8a5e10]');
  });

  it('ne transmet pas la gravité par la seule couleur (préfixe sr-only)', () => {
    const { container } = render(<AlertChip severity="danger">Zone à risque</AlertChip>);
    expect(container.querySelector('.sr-only')).toHaveTextContent('Alerte');
  });

  it('fusionne className et étale les props sur l\'élément racine', () => {
    const { container } = render(
      <AlertChip severity="info" className="mt-2" data-testid="chip">
        Repère de source
      </AlertChip>,
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.className).toContain('mt-2');
    expect(chip).toHaveAttribute('data-testid', 'chip');
  });
});
