'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
} from '@veriterra/ui';
import type { SelectedParcelle } from '@/components/map/selection-map';
import type { TerrainSummary } from '@/modules/terrains/types';

// La carte MapLibre ne doit jamais être rendue côté serveur (accès à window).
const SelectionMap = dynamic(
  () => import('@/components/map/selection-map').then((m) => m.SelectionMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-neutral-200 bg-card text-sm text-muted-foreground">
        Chargement de la carte...
      </div>
    ),
  },
);

/** Découpe le code INSEE (5 premiers caractères) d'un IDU cadastral. */
function inseeFromIdu(idu: string): string {
  return idu.slice(0, 5);
}

export default function NouveauTerrainPage() {
  const router = useRouter();

  const [parcelles, setParcelles] = useState<SelectedParcelle[]>([]);
  const [address, setAddress] = useState('');
  const [pickedInsee, setPickedInsee] = useState('');
  const [prixDemande, setPrixDemande] = useState('');
  const [lienAnnonce, setLienAnnonce] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectionChange = useCallback((next: SelectedParcelle[]) => {
    setParcelles(next);
  }, []);

  const handleAddressPick = useCallback(
    (picked: { insee: string; address: string }) => {
      setPickedInsee(picked.insee);
      setAddress((current) => (current.trim() === '' ? picked.address : current));
    },
    [],
  );

  // Code INSEE : celui de l'adresse choisie, sinon déduit de la première parcelle.
  const inseeCode = useMemo(() => {
    if (pickedInsee) return pickedInsee;
    const first = parcelles[0];
    return first ? inseeFromIdu(first.idu) : '';
  }, [pickedInsee, parcelles]);

  const totalSurface = parcelles.reduce((acc, p) => acc + p.surfaceM2, 0);
  const canSubmit = parcelles.length > 0 && address.trim() !== '' && inseeCode !== '' && !submitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const trimmedPrix = prixDemande.trim();
    const parsedPrix = trimmedPrix === '' ? null : Number(trimmedPrix);
    if (parsedPrix !== null && !Number.isFinite(parsedPrix)) {
      setError('Le prix demandé doit être un nombre.');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/terrains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim(),
          inseeCode,
          idus: parcelles.map((p) => p.idu),
          prixDemande: parsedPrix,
          lienAnnonce: lienAnnonce.trim() === '' ? null : lienAnnonce.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });

      if (res.status !== 201) {
        let message = `La création a échoué (code ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string; message?: string };
          message = data.error ?? data.message ?? message;
        } catch {
          // Corps non JSON : on garde le message par défaut.
        }
        setError(message);
        setSubmitting(false);
        return;
      }

      const { terrain } = (await res.json()) as { terrain: TerrainSummary };
      router.push(`/terrains/${terrain.id}`);
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Nouveau terrain</h1>
            <p className="text-sm text-muted-foreground">
              Recherchez une adresse, puis cliquez sur la carte pour sélectionner une ou plusieurs
              parcelles.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/">Retour au tableau de bord</Link>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <div className="h-[60vh] min-h-[24rem] lg:h-[calc(100vh-8rem)]">
            <SelectionMap
              onSelectionChange={handleSelectionChange}
              onAddressPick={handleAddressPick}
            />
          </div>

          <Card>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>Détails du terrain</CardTitle>
                <CardDescription>
                  {parcelles.length === 0
                    ? 'Sélectionnez au moins une parcelle sur la carte pour continuer.'
                    : `${parcelles.length} parcelle${parcelles.length > 1 ? 's' : ''} sélectionnée${parcelles.length > 1 ? 's' : ''}.`}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="address" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Adresse
                  </label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="12 rue des Terrains, 33000 Bordeaux"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="prix" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Prix demandé (€)
                  </label>
                  <Input
                    id="prix"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={prixDemande}
                    onChange={(e) => setPrixDemande(e.target.value)}
                    placeholder="150000"
                    className="font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="lien" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Lien de l&apos;annonce
                  </label>
                  <Input
                    id="lien"
                    type="url"
                    value={lienAnnonce}
                    onChange={(e) => setLienAnnonce(e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Observations, contexte, points à vérifier..."
                    className="flex w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground placeholder:text-neutral-400 focus-visible:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Surface totale
                  </span>
                  <p className="font-mono text-sm text-foreground">
                    {parcelles.length === 0
                      ? 'Donnée indisponible'
                      : `${Math.round(totalSurface).toLocaleString('fr-FR')} m²`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Source : IGN API Carto Cadastre</p>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                  >
                    {error}
                  </p>
                )}
              </CardContent>

              <CardFooter>
                <Button type="submit" disabled={!canSubmit} className="w-full">
                  {submitting ? 'Création...' : 'Créer le terrain'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
