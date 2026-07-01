'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { MaisonType } from '@/modules/projet/types';

// Onboarding court (US-1.0). Reskin fidèle à la maquette designée
// (docs/design/handoff/Onboarding.dc.html) : JSX + styles inline reproduisant les
// couleurs, rayons et polices du design system. La logique (état, préchargement du
// projet, save/skip, redirections) est conservée telle quelle.
//
// La maquette illustre un assistant en 4 étapes ; notre projet reste un formulaire
// court à une seule étape (budget, surfaces, type de maison), tous champs optionnels.
// On reprend donc le langage visuel de la maquette (fond pointillé, carte, libellés,
// puces de sélection, boutons) sans en inventer les champs supplémentaires.

const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'Spline Sans Mono', ui-monospace, monospace";

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

const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#4C5468',
  marginBottom: '7px',
};
const fieldInput: CSSProperties = {
  width: '100%',
  border: '1px solid #DADEE8',
  borderRadius: '10px',
  padding: '12px 14px',
  fontFamily: MONO,
  fontSize: '14.5px',
  color: '#161A2E',
  background: '#FFF',
};
const primaryBtn: CSSProperties = {
  border: 'none',
  background: '#2F3B6E',
  color: '#FFF',
  fontFamily: SANS,
  fontSize: '14.5px',
  fontWeight: 600,
  padding: '12px 22px',
  borderRadius: '11px',
  cursor: 'pointer',
};
const ghostBtn: CSSProperties = {
  border: '1px solid #DADEE8',
  background: '#FFF',
  color: '#4C5468',
  fontFamily: SANS,
  fontSize: '14px',
  fontWeight: 600,
  padding: '12px 18px',
  borderRadius: '11px',
  cursor: 'pointer',
};

function Mark({ size = 28, rx = 10, stroke = 2.4 }: { size?: number; rx?: number; stroke?: number }) {
  const id = `mark${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 152 152" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <rect x="22" y="22" width="108" height="108" rx={rx} />
        </clipPath>
      </defs>
      <rect x="22" y="22" width="108" height="108" rx={rx} fill="#EAECF4" />
      <g clipPath={`url(#${id})`}>
        <rect x="63" y="65" width="37" height="65" fill="#DB9B2C" />
        <rect x="22" y="22" width="41" height="56" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="22" y="78" width="41" height="52" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="63" y="22" width="37" height="43" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="63" y="65" width="37" height="65" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="100" y="22" width="30" height="37" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="100" y="59" width="30" height="39" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="100" y="98" width="30" height="32" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
      </g>
      <rect x="22" y="22" width="108" height="108" rx={rx} fill="none" stroke="#2F3B6E" strokeWidth="3" />
    </svg>
  );
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
    <div
      style={{
        minHeight: '100vh',
        background: '#F5F6FA',
        backgroundImage: 'radial-gradient(rgba(47,59,110,0.05) 1px,transparent 1px)',
        backgroundSize: '26px 26px',
        fontFamily: SANS,
        color: '#161A2E',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Bandeau : logo + barre de progression */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Mark size={28} />
          <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>Veriterra</span>
        </div>
        <div style={{ flex: 1, maxWidth: '380px', margin: '0 auto' }}>
          <div
            role="progressbar"
            aria-label="Progression de la configuration"
            aria-valuenow={100}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ height: '6px', borderRadius: '3px', background: '#E4E7EE', overflow: 'hidden' }}
          >
            <div style={{ height: '100%', borderRadius: '3px', background: '#2F3B6E', width: '100%' }} />
          </div>
        </div>
      </div>

      {/* Carte du formulaire */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '18px 18px 40px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '600px',
            background: '#FFFFFF',
            border: '1px solid #DADEE8',
            borderRadius: '18px',
            boxShadow: '0 20px 50px -28px rgba(22,26,46,0.35)',
            padding: '32px',
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: '11.5px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#98A0B0',
              marginBottom: '8px',
            }}
          >
            Configuration · Projet
          </div>

          <h2 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Votre projet
          </h2>
          <p style={{ margin: '0 0 22px', fontSize: '14.5px', color: '#6C7488', lineHeight: 1.5 }}>
            En une étape, cadrez votre recherche. Tout est optionnel et modifiable plus tard : vos terrains
            seront notés et filtrés selon ce projet.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Budget maximum */}
            <div>
              <label htmlFor="budget" style={fieldLabel}>
                Budget maximum (€)
              </label>
              <input
                id="budget"
                type="number"
                inputMode="numeric"
                min={0}
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="200000"
                style={fieldInput}
              />
            </div>

            {/* Surfaces */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label htmlFor="smin" style={fieldLabel}>
                  Surface minimale (m²)
                </label>
                <input
                  id="smin"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={surfaceMin}
                  onChange={(e) => setSurfaceMin(e.target.value)}
                  placeholder="400"
                  style={fieldInput}
                />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label htmlFor="smax" style={fieldLabel}>
                  Surface maximale (m²)
                </label>
                <input
                  id="smax"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={surfaceMax}
                  onChange={(e) => setSurfaceMax(e.target.value)}
                  placeholder="800"
                  style={fieldInput}
                />
              </div>
            </div>

            {/* Type de maison */}
            <div>
              <span style={{ ...fieldLabel, marginBottom: '9px' }}>Type de maison</span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {TYPES.map((t) => {
                  const on = typeMaison === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTypeMaison((current) => (current === t.value ? '' : t.value))}
                      style={{
                        border: `1px solid ${on ? '#2F3B6E' : '#DADEE8'}`,
                        background: on ? '#EEF0F8' : '#FFF',
                        color: on ? '#2F3B6E' : '#4C5468',
                        fontFamily: SANS,
                        fontSize: '13px',
                        fontWeight: 600,
                        padding: '8px 13px',
                        borderRadius: '9px',
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  margin: 0,
                  fontSize: '13.5px',
                  color: '#B23B3B',
                  background: '#FBEDED',
                  border: '1px solid #F0CFCF',
                  borderRadius: '10px',
                  padding: '10px 13px',
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginTop: '28px',
            }}
          >
            {hasProjet ? (
              // En édition, "Passer" n'a pas de sens et écraserait le projet : on revient au tableau
              // de bord sans rien enregistrer.
              <button
                type="button"
                disabled={submitting}
                onClick={() => router.push('/dashboard')}
                style={ghostBtn}
              >
                Annuler
              </button>
            ) : (
              <button type="button" disabled={submitting} onClick={() => void save(true)} style={ghostBtn}>
                Passer
              </button>
            )}
            <button type="button" disabled={submitting} onClick={() => void save(false)} style={primaryBtn}>
              {submitting ? 'Enregistrement...' : 'Enregistrer et continuer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
