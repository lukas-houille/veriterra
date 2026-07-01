'use client';

import { useCallback, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { SelectedParcelle } from '@/components/map/selection-map';
import type { TerrainSummary } from '@/modules/terrains/types';

// Écran « Explorer » (création de terrain). Reproduction fidèle de la maquette
// designée (docs/design/handoff/Explorer.dc.html) : plein écran carte, barre de
// recherche flottante et panneau de détails. La logique (état, sélection de
// parcelles, appel API, redirection) est préservée à l'identique.

const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'Spline Sans Mono', ui-monospace, monospace";

// Jetons de couleur (mode clair de la maquette).
const PANEL = '#FFFFFF';
const BORDER = '#DADEE8';
const TEXT = '#161A2E';
const SUB = '#6C7488';
const MICRO = '#98A0B0';
const NAVY = '#2F3B6E';

const microLabel: CSSProperties = {
  fontSize: '10px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: MICRO,
  fontWeight: 600,
};
const fieldInput: CSSProperties = {
  width: '100%',
  border: `1px solid ${BORDER}`,
  background: PANEL,
  borderRadius: '9px',
  padding: '9px 12px',
  fontSize: '14px',
  fontFamily: SANS,
  color: TEXT,
  outline: 'none',
};

// La carte MapLibre ne doit jamais être rendue côté serveur (accès à window).
const SelectionMap = dynamic(
  () => import('@/components/map/selection-map').then((m) => m.SelectionMap),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#E9ECF2',
          color: SUB,
          fontFamily: SANS,
          fontSize: '14px',
        }}
      >
        Chargement de la carte...
      </div>
    ),
  },
);

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 152 152" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="navlogo">
          <rect x="22" y="22" width="108" height="108" rx="10" />
        </clipPath>
      </defs>
      <rect x="22" y="22" width="108" height="108" rx="10" fill="#EAECF4" />
      <g clipPath="url(#navlogo)">
        <rect x="63" y="65" width="37" height="65" fill="#DB9B2C" />
        <rect x="22" y="22" width="41" height="56" fill="none" stroke={NAVY} strokeWidth="2.4" />
        <rect x="22" y="78" width="41" height="52" fill="none" stroke={NAVY} strokeWidth="2.4" />
        <rect x="63" y="22" width="37" height="43" fill="none" stroke={NAVY} strokeWidth="2.4" />
        <rect x="63" y="65" width="37" height="65" fill="none" stroke={NAVY} strokeWidth="2.4" />
        <rect x="100" y="22" width="30" height="37" fill="none" stroke={NAVY} strokeWidth="2.4" />
        <rect x="100" y="59" width="30" height="39" fill="none" stroke={NAVY} strokeWidth="2.4" />
        <rect x="100" y="98" width="30" height="32" fill="none" stroke={NAVY} strokeWidth="2.4" />
      </g>
      <rect x="22" y="22" width="108" height="108" rx="10" fill="none" stroke={NAVY} strokeWidth="3" />
    </svg>
  );
}

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

  const parcelleCount = parcelles.length;
  const cardDescription =
    parcelleCount === 0
      ? 'Sélectionnez au moins une parcelle sur la carte pour continuer.'
      : `${parcelleCount} parcelle${parcelleCount > 1 ? 's' : ''} sélectionnée${parcelleCount > 1 ? 's' : ''}.`;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: SANS,
        background: '#F5F6FA',
        color: TEXT,
      }}
    >
      {/* SHELL TOP BAR */}
      <header
        style={{
          position: 'relative',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          height: '58px',
          padding: '0 22px',
          background: PANEL,
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <Link
          href="/terrains/nouveau"
          style={{ display: 'flex', alignItems: 'center', gap: '11px', color: 'inherit' }}
        >
          <Mark size={30} />
          <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>Veriterra</span>
        </Link>
        <nav aria-label="Navigation principale" style={{ display: 'flex', gap: '4px', marginLeft: '14px' }}>
          <span
            aria-current="page"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: NAVY,
              background: '#EEF0F8',
              padding: '7px 13px',
              borderRadius: '8px',
            }}
          >
            Explorer
          </span>
          <Link
            href="/dashboard"
            style={{ fontSize: '14px', fontWeight: 500, color: SUB, padding: '7px 13px', borderRadius: '8px' }}
          >
            Mes terrains
          </Link>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/dashboard"
            title="Mon espace"
            aria-label="Mon espace"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: NAVY,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            VT
          </Link>
        </div>
      </header>

      {/* MAP AREA */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#E9ECF2' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <SelectionMap onSelectionChange={handleSelectionChange} onAddressPick={handleAddressPick} />
        </div>

        {/* PANNEAU DÉTAILS (carte contextuelle, haut-droite) */}
        <aside
          aria-label="Détails du terrain"
          style={{
            position: 'absolute',
            right: '16px',
            top: '16px',
            width: '360px',
            maxWidth: 'calc(100% - 32px)',
            maxHeight: 'calc(100% - 32px)',
            display: 'flex',
            flexDirection: 'column',
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: '14px',
            boxShadow: '0 18px 40px -14px rgba(16,20,34,0.5)',
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '16px' }}
          >
            <div style={{ marginBottom: '14px' }}>
              <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: TEXT }}>Détails du terrain</h1>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: SUB, lineHeight: 1.4 }}>{cardDescription}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="address" style={microLabel}>
                  Adresse
                </label>
                <input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="12 rue des Terrains, 33000 Bordeaux"
                  style={fieldInput}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="prix" style={microLabel}>
                  Prix demandé (€)
                </label>
                <input
                  id="prix"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={prixDemande}
                  onChange={(e) => setPrixDemande(e.target.value)}
                  placeholder="150000"
                  style={{ ...fieldInput, fontFamily: MONO }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="lien" style={microLabel}>
                  Lien de l&apos;annonce
                </label>
                <input
                  id="lien"
                  type="url"
                  value={lienAnnonce}
                  onChange={(e) => setLienAnnonce(e.target.value)}
                  placeholder="https://..."
                  style={fieldInput}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="notes" style={microLabel}>
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Observations, contexte, points à vérifier..."
                  style={{ ...fieldInput, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
            </div>

            {/* Surface totale sourcée */}
            <div
              style={{
                marginTop: '14px',
                borderTop: `1px solid ${BORDER}`,
                paddingTop: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                <span style={microLabel}>Surface totale</span>
                <span style={{ fontFamily: MONO, fontSize: '18px', fontWeight: 500, color: TEXT }}>
                  {parcelleCount === 0
                    ? 'Donnée indisponible'
                    : `${Math.round(totalSurface).toLocaleString('fr-FR')} m²`}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '8px',
                  fontSize: '10.5px',
                  color: MICRO,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2F6E8F', flexShrink: 0 }}
                />
                <span>Source · IGN API Carto Cadastre</span>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  marginTop: '13px',
                  marginBottom: 0,
                  border: '1px solid #E7C4BC',
                  background: '#F8E7E2',
                  color: '#C0432E',
                  borderRadius: '9px',
                  padding: '9px 12px',
                  fontSize: '13px',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                marginTop: '16px',
                width: '100%',
                textAlign: 'center',
                background: canSubmit ? NAVY : '#AEB4C6',
                color: '#FFFFFF',
                fontFamily: SANS,
                fontSize: '13.5px',
                fontWeight: 600,
                padding: '11px',
                borderRadius: '9px',
                border: 'none',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Création...' : 'Créer le terrain'}
            </button>

            <Link
              href="/dashboard"
              style={{
                marginTop: '8px',
                display: 'block',
                textAlign: 'center',
                color: SUB,
                fontSize: '13px',
                fontWeight: 500,
                padding: '8px',
                borderRadius: '9px',
              }}
            >
              Retour au tableau de bord
            </Link>
          </form>
        </aside>
      </div>
    </div>
  );
}
