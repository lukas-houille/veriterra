'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertChip, cn } from '@veriterra/ui';
import type { CriterionScore, ScoreResult } from '@/modules/terrains/scoring';

// Îlot client (US-3.1) : carte de score éditable. Chaque critère peut recevoir une note manuelle
// (override) qui remplace la note dérivée et recalcule le global (côté serveur, via router.refresh).
// La valeur d'origine (dérivée des données) reste affichée pour la traçabilité (règle 1). Un critère
// non évalué (score null, règle 3) reste distinct d'un 0 : son origine est notée « non évalué ».

/** Rend la valeur d'origine tracée d'un override, jamais un 0 fabriqué (règle 3). */
function originLabel(c: CriterionScore): string {
  if (c.originalScore == null) return 'auto : non évalué';
  return `auto : ${c.originalScore}`;
}

function CriterionRow({
  terrainId,
  criterion,
  onChanged,
}: {
  terrainId: string;
  criterion: CriterionScore;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(criterion.score != null ? String(criterion.score) : '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  const disabled = pending || busy;

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError('Note attendue entre 0 et 100.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/terrains/${terrainId}/score-overrides`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ criterion: criterion.key, score: Math.round(n), note: note || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Échec de l'enregistrement.");
        return;
      }
      setEditing(false);
      setNote('');
      start(onChanged);
    } catch {
      // Panne réseau (fetch rejette) : signaler comme une erreur 4xx plutôt qu'un échec silencieux.
      setError('Enregistrement impossible, vérifiez la connexion et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/terrains/${terrainId}/score-overrides?criterion=${encodeURIComponent(criterion.key)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Échec de la réinitialisation.');
        return;
      }
      start(onChanged);
    } catch {
      setError('Réinitialisation impossible, vérifiez la connexion et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  function openEditor() {
    setValue(criterion.score != null ? String(criterion.score) : '');
    // Recharge la justification déjà saisie pour ne pas l'effacer en ré-enregistrant (règle 1).
    setNote(criterion.overrideNote ?? '');
    setError(null);
    setEditing(true);
  }

  return (
    <div className="border-b border-neutral-100 py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-44 shrink-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
            {criterion.label}
            {criterion.overridden ? (
              <span
                className="rounded bg-amber-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-700"
                title={`Note saisie manuellement. ${criterion.originalBasis ? `Valeur d'origine : ${criterion.originalBasis}` : ''}`}
              >
                manuel
              </span>
            ) : null}
          </p>
          <p className="truncate text-[10.5px] text-neutral-400" title={criterion.basis}>
            {criterion.basis}
            {criterion.overridden ? ` · ${originLabel(criterion)}` : ''}
          </p>
        </div>
        {criterion.score != null ? (
          <>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={cn('h-full rounded-full', criterion.overridden ? 'bg-amber-500' : 'bg-indigo-500')}
                style={{ width: `${criterion.score}%` }}
              />
            </div>
            <span className="w-7 shrink-0 text-right font-mono text-xs text-neutral-700">{criterion.score}</span>
          </>
        ) : (
          <span className="flex-1 text-xs italic text-neutral-400">non évalué</span>
        )}
        {!editing ? (
          <button
            type="button"
            onClick={openEditor}
            className="shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-[10.5px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ajuster
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-medium text-neutral-600" htmlFor={`ov-${criterion.key}`}>
              Note manuelle (0-100)
            </label>
            <input
              id={`ov-${criterion.key}`}
              type="number"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `ov-err-${criterion.key}` : undefined}
              className="h-8 w-20 rounded-md border border-neutral-300 bg-white px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Justification (optionnelle)"
            maxLength={500}
            disabled={disabled}
            aria-label="Justification de l'ajustement"
            className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error ? (
            <p id={`ov-err-${criterion.key}`} role="alert" className="text-[11px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={disabled}
              className="rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {disabled ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={disabled}
              className="rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Annuler
            </button>
            {criterion.overridden ? (
              <button
                type="button"
                onClick={reset}
                disabled={disabled}
                className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-red-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Réinitialiser
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Carte de score éditable (US-3.1/3.2/3.4) : jauge globale en tête (fiche), détail par critère
 *  sourcé et ajustable, alertes rouges. */
export function ScoreCriteriaEditor({ terrainId, score }: { terrainId: string; score: ScoreResult }) {
  const router = useRouter();
  const onChanged = () => router.refresh();

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Score par catégorie</h2>
        <span className="font-mono text-[11px] text-neutral-400">dérivé des données sourcées, relatif au projet</span>
      </div>
      {score.redFlags.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {score.redFlags.map((f) => (
            <AlertChip key={f.key} severity="danger">
              {f.label}
            </AlertChip>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col">
        {score.criteria.map((c) => (
          <CriterionRow key={c.key} terrainId={terrainId} criterion={c} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}
