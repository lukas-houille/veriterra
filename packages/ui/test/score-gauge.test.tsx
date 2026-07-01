import { render, screen } from '@testing-library/react';
import { ScoreGauge } from '../src/signature/score-gauge.js';

describe('ScoreGauge', () => {
  it('se rend sans crash et expose un libellé accessible', () => {
    render(<ScoreGauge value={72} />);
    expect(screen.getByRole('img', { name: 'Score 72 sur 100' })).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
  });

  it('borne (clampe) une valeur au-dessus de 100', () => {
    render(<ScoreGauge value={140} />);
    expect(screen.getByRole('img', { name: 'Score 100 sur 100' })).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('borne (clampe) une valeur négative à 0', () => {
    render(<ScoreGauge value={-20} />);
    expect(screen.getByRole('img', { name: 'Score 0 sur 100' })).toBeInTheDocument();
  });

  it('dessine la piste et l\'arc avec les bonnes classes de couleur', () => {
    const { container } = render(<ScoreGauge value={50} />);
    expect(container.querySelector('.stroke-neutral-100')).toBeInTheDocument();
    const arc = container.querySelector('.stroke-indigo-500') as SVGCircleElement;
    expect(arc).toBeInTheDocument();
    // À 50 %, le décalage vaut la moitié du périmètre.
    const dasharray = Number(arc.getAttribute('stroke-dasharray'));
    const dashoffset = Number(arc.getAttribute('stroke-dashoffset'));
    expect(dashoffset).toBeCloseTo(dasharray / 2, 5);
  });

  it('adapte les dimensions du SVG à la prop size', () => {
    const { container } = render(<ScoreGauge value={30} size={72} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('72');
    expect(svg.getAttribute('height')).toBe('72');
  });
});
