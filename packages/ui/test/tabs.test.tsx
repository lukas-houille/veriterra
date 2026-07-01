import { render, screen } from '@testing-library/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/primitives/tabs.js';

function Sample({ defaultValue = 'cadastre' }: { defaultValue?: string }) {
  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="cadastre">Cadastre</TabsTrigger>
        <TabsTrigger value="risques">Risques</TabsTrigger>
      </TabsList>
      <TabsContent value="cadastre">Contenu cadastre</TabsContent>
      <TabsContent value="risques">Contenu risques</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('rend la liste et les déclencheurs sans crash', () => {
    render(<Sample />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cadastre' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Risques' })).toBeInTheDocument();
  });

  it("marque l'onglet par défaut comme actif et masque les autres panneaux", () => {
    render(<Sample />);
    const actif = screen.getByRole('tab', { name: 'Cadastre' });
    const inactif = screen.getByRole('tab', { name: 'Risques' });

    expect(actif).toHaveAttribute('data-state', 'active');
    expect(actif).toHaveAttribute('aria-selected', 'true');
    expect(inactif).toHaveAttribute('data-state', 'inactive');

    // Progressive disclosure : seul le panneau actif est visible.
    expect(screen.getByText('Contenu cadastre')).toBeInTheDocument();
    expect(screen.queryByText('Contenu risques')).not.toBeInTheDocument();
  });

  it("applique le soulignement indigo et la couleur d'encre sur l'onglet actif", () => {
    render(<Sample defaultValue="risques" />);
    const actif = screen.getByRole('tab', { name: 'Risques' });
    expect(actif).toHaveClass('data-[state=active]:border-indigo-500');
    expect(actif).toHaveClass('data-[state=active]:text-indigo-700');
    expect(actif).toHaveClass('text-neutral-500');
  });

  it('expose la bordure basse sur la liste et le padding sur le contenu', () => {
    render(<Sample />);
    expect(screen.getByRole('tablist')).toHaveClass('border-b', 'border-neutral-200');
    expect(screen.getByText('Contenu cadastre')).toHaveClass('pt-4');
  });
});
