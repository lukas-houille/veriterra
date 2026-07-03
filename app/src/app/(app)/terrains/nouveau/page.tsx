'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button, Input, cn } from '@veriterra/ui';
import type { SelectedParcelle } from '@/components/map/selection-map';
import type { TerrainSummary } from '@/modules/terrains/types';

// Écran « Explorer » (création de terrain) : plein écran carte + panneau de détails flottant.
// La logique (état, sélection de parcelles, appel API, redirection) est préservée à
// l'identique ; la présentation est en tokens du design system, sous le shell commun.

// Style commun aux champs textarea, aligné sur le composant Input (@veriterra/ui).
const fieldClass =
  'flex w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-indigo-400';

// La carte MapLibre ne doit jamais être rendue côté serveur (accès à window).
const SelectionMap = dynamic(
  () => import('@/components/map/selection-map').then((m) => m.SelectionMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
        Chargement de la carte...
      </div>
    ),
  },
);

/** Champ de formulaire : label micro (capitales) au-dessus du contrôle. */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Découpe le code INSEE (5 premiers caractères) d'un IDU cadastral. */
function inseeFromIdu(idu: string): string {
  return idu.slice(0, 5);
}

function NouveauTerrainInner() {
  const router = useRouter();
  // Mode « focus terrain » : ouvert depuis la fiche (bouton agrandir) via ?terrain=<id>. On précharge
  // les parcelles du terrain, on les centre, et on offre un retour à la fiche (pas de création ici).
  const searchParams = useSearchParams();
  const focusTerrainId = searchParams.get('terrain');
  const [focusInitial, setFocusInitial] = useState<SelectedParcelle[] | undefined>(undefined);
  // Explorer normal (sans ?terrain) : prêt dès le premier rendu (la carte monte immédiatement, comme
  // avant). Mode focus : on attend le préchargement des parcelles pour que la graine soit disponible.
  const [focusReady, setFocusReady] = useState(!focusTerrainId);

  const [parcelles, setParcelles] = useState<SelectedParcelle[]>([]);
  const [address, setAddress] = useState('');
  const [pickedInsee, setPickedInsee] = useState('');
  const [prixDemande, setPrixDemande] = useState('');
  const [lienAnnonce, setLienAnnonce] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sur mobile, le panneau de détails est une feuille inférieure repliable : replié, il ne montre
  // que son en-tête et rend la carte de nouveau visible (retour porteur : « prend toute la place »).
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Précharge les parcelles du terrain focalisé (scoped côté serveur) avant de monter la carte, pour
  // que la sélection initiale soit disponible au premier rendu (la carte l'utilise comme graine).
  useEffect(() => {
    if (!focusTerrainId) {
      setFocusReady(true);
      return;
    }
    let cancelled = false;
    void fetch(`/api/terrains/${focusTerrainId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { terrain?: { parcelles?: SelectedParcelle[] } } | null) => {
        if (cancelled) return;
        const ps = data?.terrain?.parcelles;
        if (Array.isArray(ps)) {
          setFocusInitial(
            ps.map((p) => ({
              idu: p.idu,
              geojson: p.geojson,
              surfaceM2: p.surfaceM2,
              commune: p.commune,
              section: p.section,
              numero: p.numero,
            })),
          );
        }
        setFocusReady(true);
      })
      .catch(() => {
        if (!cancelled) setFocusReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [focusTerrainId]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
          parcelles: parcelles.map((p) => ({
            idu: p.idu,
            commune: p.commune,
            section: p.section,
            numero: p.numero,
            surfaceM2: p.surfaceM2,
            geojson: p.geojson,
          })),
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

  // Le panneau de détails n'apparaît qu'après sélection : ce libellé décrit donc toujours au moins une parcelle.
  const parcelleCount = parcelles.length;
  const cardDescription = `${parcelleCount} parcelle${parcelleCount > 1 ? 's' : ''} sélectionnée${
    parcelleCount > 1 ? 's' : ''
  }.`;

  return (
    <div className="flex h-[calc(100dvh-3.625rem)] flex-col bg-background text-foreground">
      {/* Barre de retour à la fiche (mode focus terrain uniquement). */}
      {focusTerrainId && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-2">
          <Link
            href={`/terrains/${focusTerrainId}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-indigo-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true">←</span>
            Retour à la fiche
          </Link>
          <span className="text-xs text-neutral-500">Vue explorateur focalisée sur le terrain</span>
        </div>
      )}

      {/* MAP AREA (la barre de nav est fournie par le shell (app)) */}
      <div className="relative flex-1 overflow-hidden bg-neutral-100">
        <div className="absolute inset-0">
          {focusReady ? (
            <SelectionMap
              initialSelection={focusInitial}
              onSelectionChange={handleSelectionChange}
              onAddressPick={handleAddressPick}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
              Chargement du terrain...
            </div>
          )}
        </div>

        {/* PANNEAU DÉTAILS : création uniquement (masqué en mode focus, où le terrain existe déjà). */}
        {!focusTerrainId && parcelleCount > 0 && (
          <>
            {/* Pastille repliée (mobile) : rouvre la feuille sans masquer les outils de la carte. */}
            {panelCollapsed && (
              <button
                type="button"
                onClick={() => setPanelCollapsed(false)}
                aria-label="Déplier les détails du terrain"
                aria-expanded={false}
                aria-controls="terrain-details-form"
                className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              >
                Détails du terrain
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1 text-xs font-bold text-white">
                  {parcelleCount}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            )}
            <aside
            aria-label="Détails du terrain"
            className={cn(
              // Mobile : feuille inférieure pleine largeur, plafonnée pour laisser voir la carte.
              'absolute inset-x-0 bottom-0 z-20 flex max-h-[70dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg',
              // >= sm : panneau flottant en haut à droite (comportement d'origine).
              'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:max-h-[calc(100%-2rem)] sm:w-[360px] sm:max-w-[calc(100%-2rem)] sm:rounded-xl',
              // Replié sur mobile : la feuille cède la place à la pastille (les outils carte restent joignables).
              panelCollapsed && 'hidden sm:flex',
            )}
          >
            {/* Poignée visuelle de feuille inférieure (mobile). */}
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-300 sm:hidden" aria-hidden="true" />

            {/* En-tête toujours visible : titre + bouton de repli (mobile uniquement). */}
            <div className="flex shrink-0 items-start gap-2 px-4 pt-3 sm:pt-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold text-foreground">Détails du terrain</h1>
                <p className="mt-0.5 text-xs leading-snug text-neutral-500">{cardDescription}</p>
              </div>
              <button
                type="button"
                onClick={() => setPanelCollapsed((c) => !c)}
                aria-expanded={!panelCollapsed}
                aria-controls="terrain-details-form"
                aria-label={panelCollapsed ? 'Déplier le formulaire' : 'Replier le formulaire'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={cn('transition-transform', panelCollapsed ? '' : 'rotate-180')}
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            </div>

            <form
              id="terrain-details-form"
              onSubmit={handleSubmit}
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3',
                panelCollapsed && 'hidden sm:flex',
              )}
            >
              <Field label="Adresse" htmlFor="address">
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="12 rue des Terrains, 33000 Bordeaux"
                />
              </Field>

              <Field label="Prix demandé (€)" htmlFor="prix">
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
              </Field>

              <Field label="Lien de l'annonce" htmlFor="lien">
                <Input
                  id="lien"
                  type="url"
                  value={lienAnnonce}
                  onChange={(e) => setLienAnnonce(e.target.value)}
                  placeholder="https://..."
                />
              </Field>

              <Field label="Notes" htmlFor="notes">
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Observations, contexte, points à vérifier..."
                  className={`${fieldClass} resize-y leading-relaxed`}
                />
              </Field>

              {/* Surface totale sourcée (une sélection existe forcément ici) */}
              <div className="mt-1 border-t border-border pt-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                    Surface totale
                  </span>
                  <span className="font-mono text-lg font-medium tabular-nums text-foreground">
                    {Math.round(totalSurface).toLocaleString('fr-FR')} m²
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-neutral-500">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
                  <span>Source · IGN API Carto Cadastre</span>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Button type="submit" disabled={!canSubmit} className="mt-1 w-full">
                {submitting ? 'Création...' : 'Créer le terrain'}
              </Button>

              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/dashboard">Retour au tableau de bord</Link>
              </Button>
            </form>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

// `useSearchParams` (mode focus terrain) exige une frontière Suspense.
export default function NouveauTerrainPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-3.625rem)] items-center justify-center bg-background text-sm text-neutral-500">
          Chargement de la carte...
        </div>
      }
    >
      <NouveauTerrainInner />
    </Suspense>
  );
}
