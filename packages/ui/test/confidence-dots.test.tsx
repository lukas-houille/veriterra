import { render, screen } from '@testing-library/react';
import { ConfidenceDots } from '../src/signature/confidence-dots.js';

describe('ConfidenceDots', () => {
  it('se rend sans crash et expose un libellé accessible', () => {
    render(<ConfidenceDots confidence="élevée" />);
    expect(screen.getByRole('img', { name: 'Confiance élevée' })).toBeInTheDocument();
  });

  it('remplit le bon nombre de points selon le niveau', () => {
    const filledCount = (level: 'élevée' | 'moyenne' | 'faible') => {
      const { container, unmount } = render(<ConfidenceDots confidence={level} />);
      const filled = container.querySelectorAll('.bg-indigo-500').length;
      const empty = container.querySelectorAll('.bg-neutral-200').length;
      unmount();
      return { filled, empty };
    };

    expect(filledCount('élevée')).toEqual({ filled: 3, empty: 0 });
    expect(filledCount('moyenne')).toEqual({ filled: 2, empty: 1 });
    expect(filledCount('faible')).toEqual({ filled: 1, empty: 2 });
  });

  it('affiche le libellé texte par défaut (showLabel)', () => {
    render(<ConfidenceDots confidence="moyenne" />);
    // Libellé visible : présent à la fois sur le groupe (aria-label) et en texte.
    const labels = screen.getAllByText('Confiance moyenne');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('garde le libellé en sr-only quand showLabel est false', () => {
    const { container } = render(
      <ConfidenceDots confidence="faible" showLabel={false} />,
    );
    // Toujours accessible via le rôle image, même sans texte visible.
    expect(screen.getByRole('img', { name: 'Confiance faible' })).toBeInTheDocument();
    expect(container.querySelector('.sr-only')).toHaveTextContent('Confiance faible');
  });
});
