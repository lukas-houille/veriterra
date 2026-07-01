'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import type { MaisonType } from '@/modules/projet/types';

// Onboarding court (US-1.0). Tous les champs sont optionnels : on peut passer, un projet
// par défaut est alors créé. Tout deviendra relatif à ce projet (score, filtres).

const TYPES: Array<{ value: MaisonType; label: string }> = [
  { value: 'PLAIN_PIED', label: 'Plain-pied' },
  { value: 'R1', label: 'R+1' },
  { value: 'R2', label: 'R+2' },
  { value: 'R3', label: 'R+3' },
];

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function OnboardingPage() {
  const router = useRouter();

  const [budgetMax, setBudgetMax] = useState('');
  const [surfaceMin, setSurfaceMin] = useState('');
  const [surfaceMax, setSurfaceMax] = useState('');
  const [typeMaison, setTypeMaison] = useState<MaisonType | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasProjet, setHasProjet] = useState(false);

  // Cette page sert aussi d'édition (lien "Mon projet" du tableau de bord). On précharge donc
  // le projet existant : sans cela, un enregistrement écraserait tous les champs avec null.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/projet');
        if (!res.ok) return;
        const { projet } = (await res.json()) as {
          projet: {
            budgetMax: number | null;
            surfaceMinM2: number | null;
            surfaceMaxM2: number | null;
            typeMaison: MaisonType | null;
          } | null;
        };
        if (cancelled || !projet) return;
        setHasProjet(true);
        if (projet.budgetMax != null) setBudgetMax(String(projet.budgetMax));
        if (projet.surfaceMinM2 != null) setSurfaceMin(String(projet.surfaceMinM2));
        if (projet.surfaceMaxM2 != null) setSurfaceMax(String(projet.surfaceMaxM2));
        if (projet.typeMaison != null) setTypeMaison(projet.typeMaison);
      } catch {
        // Préremplissage best-effort : en cas d'échec, on garde le formulaire vide.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(skip: boolean) {
    setSubmitting(true);
    setError(null);
    const body = skip
      ? {}
      : {
          budgetMax: toNumberOrNull(budgetMax),
          surfaceMinM2: toNumberOrNull(surfaceMin),
          surfaceMaxM2: toNumberOrNull(surfaceMax),
          typeMaison: typeMaison === '' ? null : typeMaison,
        };
    try {
      const res = await fetch('/api/projet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError('Enregistrement impossible. Réessayez.');
        setSubmitting(false);
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Impossible de joindre le serveur.');
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex items-center gap-3">
            <img src="/veriterra-mark.svg" alt="" width={32} height={32} className="rounded-md" />
            <span className="text-lg font-bold tracking-tight text-foreground">Veriterra</span>
          </div>
          <CardTitle>Votre projet</CardTitle>
          <CardDescription>
            En une étape, cadrez votre recherche. Tout est optionnel et modifiable plus tard : vos
            terrains seront notés et filtrés selon ce projet.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="budget" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Budget maximum (€)
            </label>
            <Input
              id="budget"
              type="number"
              inputMode="numeric"
              min={0}
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              placeholder="200000"
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="smin" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Surface min (m²)
              </label>
              <Input
                id="smin"
                type="number"
                inputMode="numeric"
                min={0}
                value={surfaceMin}
                onChange={(e) => setSurfaceMin(e.target.value)}
                placeholder="400"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="smax" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Surface max (m²)
              </label>
              <Input
                id="smax"
                type="number"
                inputMode="numeric"
                min={0}
                value={surfaceMax}
                onChange={(e) => setSurfaceMax(e.target.value)}
                placeholder="800"
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Type de maison
            </span>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={typeMaison === t.value}
                  onClick={() => setTypeMaison((current) => (current === t.value ? '' : t.value))}
                  className={
                    typeMaison === t.value
                      ? 'rounded-md border border-indigo-500 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700'
                      : 'rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-foreground hover:bg-neutral-50'
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-3">
          {hasProjet ? (
            // En édition, "Passer" n'a pas de sens et écraserait le projet : on revient au tableau
            // de bord sans rien enregistrer.
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => router.push('/dashboard')}
            >
              Annuler
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => void save(true)}>
              Passer
            </Button>
          )}
          <Button type="button" disabled={submitting} onClick={() => void save(false)}>
            {submitting ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
