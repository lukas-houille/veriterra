import { render, screen } from '@testing-library/react';
import { StatusPin, type PortfolioStatus } from '../src/signature/status-pin.js';

describe('StatusPin', () => {
  it('se rend sans crash et expose un libellé accessible', () => {
    render(<StatusPin status="à visiter" />);
    expect(
      screen.getByRole('img', { name: 'Statut : à visiter' }),
    ).toBeInTheDocument();
  });

  it('applique la couleur et le halo propres à chaque statut (pipeline à 7 états)', () => {
    const cases: Array<{ status: PortfolioStatus; hex: string; halo: string }> = [
      { status: 'à contacter', hex: 'rgb(152, 160, 176)', halo: 'rgba(152, 160, 176, 0.18)' },
      { status: 'à visiter', hex: 'rgb(99, 102, 241)', halo: 'rgba(99, 102, 241, 0.18)' },
      { status: 'visité', hex: 'rgb(8, 145, 178)', halo: 'rgba(8, 145, 178, 0.18)' },
      { status: 'démarches en cours', hex: 'rgb(219, 155, 44)', halo: 'rgba(219, 155, 44, 0.18)' },
      { status: 'sous compromis', hex: 'rgb(46, 125, 91)', halo: 'rgba(46, 125, 91, 0.18)' },
      { status: 'vendu', hex: 'rgb(120, 113, 108)', halo: 'rgba(120, 113, 108, 0.18)' },
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

  it('repli neutre pour un statut inconnu (ne plante pas, règle 3)', () => {
    // Statut hors union (ex. valeur d'enum non encore stylée) : rendu avec la couleur de repli.
    render(<StatusPin status={'inconnu' as PortfolioStatus} />);
    const pin = screen.getByRole('img', { name: 'Statut : inconnu' });
    expect(pin).toHaveStyle({ backgroundColor: 'rgb(152, 160, 176)' });
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
