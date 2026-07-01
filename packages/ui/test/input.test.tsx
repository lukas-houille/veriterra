import { render, screen } from '@testing-library/react';
import { Input } from '../src/primitives/input.js';

describe('Input', () => {
  it('se rend sans crash et accepte un placeholder', () => {
    render(<Input placeholder="Adresse du terrain" />);
    expect(screen.getByPlaceholderText('Adresse du terrain')).toBeInTheDocument();
  });

  it('étale les props sur l\'élément input (React 19, ref/props en racine)', () => {
    render(<Input aria-label="Recherche" name="query" defaultValue="Lyon" />);
    const input = screen.getByRole('textbox', { name: 'Recherche' });
    expect(input).toHaveAttribute('name', 'query');
    expect(input).toHaveValue('Lyon');
  });

  it('applique la bordure danger en état d\'erreur (aria-invalid)', () => {
    render(<Input aria-label="Prix" aria-invalid />);
    const input = screen.getByRole('textbox', { name: 'Prix' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toContain('aria-[invalid=true]:border-danger');
  });

  it('gère l\'état désactivé', () => {
    render(<Input aria-label="Surface" disabled />);
    const input = screen.getByRole('textbox', { name: 'Surface' });
    expect(input).toBeDisabled();
    expect(input.className).toContain('disabled:cursor-not-allowed');
  });

  it('permet de fusionner une classe personnalisée', () => {
    render(<Input aria-label="Note" className="font-mono" />);
    expect(screen.getByRole('textbox', { name: 'Note' }).className).toContain('font-mono');
  });
});
