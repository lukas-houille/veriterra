import { render, screen } from '@testing-library/react';
import { UnavailableState } from '../src/signature/unavailable-state.js';

describe('UnavailableState', () => {
  it('se rend sans crash avec le libellé par défaut', () => {
    render(<UnavailableState />);
    const region = screen.getByRole('status');
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('Donnée indisponible');
  });

  it('affiche une bordure en pointillés et aucune valeur fantôme', () => {
    render(<UnavailableState />);
    const region = screen.getByRole('status');
    expect(region).toHaveClass('border-dashed', 'border-neutral-300');
    // Pas de bouton de demande quand onRequest est absent.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('accepte un libellé personnalisé', () => {
    render(<UnavailableState label="Hors couverture DVF" />);
    expect(screen.getByText('Hors couverture DVF')).toBeInTheDocument();
  });

  it('rend un bouton « Demander la donnée » et déclenche onRequest au clic', () => {
    const onRequest = vi.fn();
    render(<UnavailableState onRequest={onRequest} />);
    const button = screen.getByRole('button', { name: 'Demander la donnée' });
    button.click();
    expect(onRequest).toHaveBeenCalledTimes(1);
  });
});
