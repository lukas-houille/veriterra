import { render, screen } from '@testing-library/react';
import { StatusPin, type PortfolioStatus } from '../src/signature/status-pin.js';

describe('StatusPin', () => {
  it('se rend sans crash et expose un libellé accessible', () => {
    render(<StatusPin status="prometteur" />);
    expect(
      screen.getByRole('img', { name: 'Statut : prometteur' }),
    ).toBeInTheDocument();
  });

  it('applique la couleur et le halo propres à chaque statut', () => {
    const cases: Array<{ status: PortfolioStatus; hex: string; halo: string }> = [
      { status: 'à étudier', hex: 'rgb(152, 160, 176)', halo: 'rgba(152, 160, 176, 0.18)' },
      { status: 'prometteur', hex: 'rgb(46, 125, 91)', halo: 'rgba(46, 125, 91, 0.18)' },
      { status: 'réservé', hex: 'rgb(219, 155, 44)', halo: 'rgba(219, 155, 44, 0.18)' },
      { status: 'écarté', hex: 'rgb(192, 67, 46)', halo: 'rgba(192, 67, 46, 0.18)' },
    ];

    for (const { status, hex, halo } of cases) {
      const { unmount } = render(<StatusPin status={status} />);
      const pin = screen.getByRole('img', { name: `Statut : ${status}` });
      expect(pin).toHaveStyle({ backgroundColor: hex });
      expect(pin.style.boxShadow).toBe(`0 0 0 3px ${halo}`);
      unmount();
    }
  });

  it('rend un cercle de 13px et fusionne className/style fournis', () => {
    render(
      <StatusPin status="écarté" className="ml-2" style={{ opacity: 0.5 }} />,
    );
    const pin = screen.getByRole('img', { name: 'Statut : écarté' });
    expect(pin).toHaveClass('w-[13px]', 'h-[13px]', 'rounded-full', 'ml-2');
    expect(pin).toHaveStyle({ opacity: '0.5' });
    // Le style du composant reste appliqué malgré le style externe.
    expect(pin).toHaveStyle({ backgroundColor: 'rgb(192, 67, 46)' });
  });
});
