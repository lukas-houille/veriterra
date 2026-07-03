'use client';

import { useState } from 'react';
import type { MaisonType, ProjetSummary } from '@/modules/projet/types';

// Édition du projet (les critères qui pilotent le scoring) depuis le profil. Réutilise les champs
// de l'onboarding (budget, surfaces, type de maison) et ajoute le nom et le consentement de partage.
// Enregistre via POST /api/projet et reste sur la page (pas de redirection, contrairement à l'onboarding).

const TYPES: Array<{ value: MaisonType; label: string }> = [
  { value: 'PLAIN_PIED', label: 'Plain-pied' },
  { value: 'R1', label: 'R+1' },
  { value: 'R2', label: 'R+2' },
  { value: 'R3', label: 'R+3' },
];

function toNumberOrNull(value: string): number | null {
  const t = value.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'mb-1.5 block text-xs font-semibold text-neutral-600';

export function ProjetForm({ initial }: { initial: ProjetSummary | null }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [budgetMax, setBudgetMax] = useState(initial?.budgetMax != null ? String(initial.budgetMax) : '');
  const [surfaceMin, setSurfaceMin] = useState(initial?.surfaceMinM2 != null ? String(initial.surfaceMinM2) : '');
  const [surfaceMax, setSurfaceMax] = useState(initial?.surfaceMaxM2 != null ? String(initial.surfaceMaxM2) : '');
  const [typeMaison, setTypeMaison] = useState<MaisonType | ''>(initial?.typeMaison ?? '');
  const [consent, setConsent] = useState(initial?.consentementPartage ?? false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/projet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          budgetMax: toNumberOrNull(budgetMax),
          surfaceMinM2: toNumberOrNull(surfaceMin),
          surfaceMaxM2: toNumberOrNull(surfaceMax),
          typeMaison: typeMaison === '' ? null : typeMaison,
          consentementPartage: consent,
        }),
      });
      if (!res.ok) {
        setMsg({ ok: false, text: 'Enregistrement impossible. Réessayez.' });
        return;
      }
      setMsg({ ok: true, text: 'Projet enregistré.' });
    } catch {
      setMsg({ ok: false, text: 'Impossible de joindre le serveur.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="projet-name" className={labelClass}>
          Nom du projet
        </label>
        <input
          id="projet-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mon projet"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="projet-budget" className={labelClass}>
          Budget maximum (€)
        </label>
        <input
          id="projet-budget"
          type="number"
          inputMode="numeric"
          min={0}
          value={budgetMax}
          onChange={(e) => setBudgetMax(e.target.value)}
          placeholder="200000"
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap gap-3.5">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="projet-smin" className={labelClass}>
            Surface minimale (m²)
          </label>
          <input
            id="projet-smin"
            type="number"
            inputMode="numeric"
            min={0}
            value={surfaceMin}
            onChange={(e) => setSurfaceMin(e.target.value)}
            placeholder="400"
            className={inputClass}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label htmlFor="projet-smax" className={labelClass}>
            Surface maximale (m²)
          </label>
          <input
            id="projet-smax"
            type="number"
            inputMode="numeric"
            min={0}
            value={surfaceMax}
            onChange={(e) => setSurfaceMax(e.target.value)}
            placeholder="800"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Type de maison</span>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const on = typeMaison === t.value;
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() => setTypeMaison((current) => (current === t.value ? '' : t.value))}
                className={
                  'rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (on
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-500'
                    : 'border-border bg-card text-neutral-600 hover:bg-neutral-50')
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-indigo-500"
        />
        <span>
          J&apos;accepte que mes terrains puissent être partagés (constructeurs, agents) dans le cadre de
          la mise en relation. Réversible à tout moment.
        </span>
      </label>

      {msg && (
        <p
          role={msg.ok ? 'status' : 'alert'}
          aria-live="polite"
          className={
            'm-0 rounded-lg border px-3 py-2.5 text-[13.5px] ' +
            (msg.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-destructive/30 bg-destructive/10 text-destructive')
          }
        >
          {msg.text}
        </p>
      )}

      <div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer le projet'}
        </button>
      </div>
    </div>
  );
}
