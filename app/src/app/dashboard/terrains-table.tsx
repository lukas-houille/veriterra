'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  filterTerrains,
  prixM2 as prixM2Of,
  sortTerrains,
  type TerrainListItem,
  type TerrainSortKey,
} from '@/modules/terrains/terrain-list';

// Îlot client : recherche et tri de la liste des terrains (US-5.9). Le tableau était rendu
// côté serveur ; on le déplace ici pour l'interactivité (filtre + tri en mémoire sur les
// terrains déjà chargés). Le rendu visuel (styles) reste fidèle à la maquette du dashboard.

const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'Spline Sans Mono', ui-monospace, monospace";

// Styles de statut alignés sur le dashboard (couleur de texte + fond de badge).
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  A_ETUDIER: { label: 'À étudier', color: '#98A0B0', bg: '#ECEEF2' },
  PROMETTEUR: { label: 'Prometteur', color: '#2E7D5B', bg: '#E7F2EC' },
  RESERVE: { label: 'Réservé', color: '#DB9B2C', bg: '#FBF2DD' },
  ECARTE: { label: 'Écarté', color: '#C0432E', bg: '#F8E7E2' },
};
const STATUS_FALLBACK = { label: 'À étudier', color: '#98A0B0', bg: '#ECEEF2' };

function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? STATUS_FALLBACK;
}

const surfaceFormat = new Intl.NumberFormat('fr-FR');
const prixFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const SORT_OPTIONS: Array<{ value: TerrainSortKey; label: string }> = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'surface', label: 'Surface' },
  { value: 'prixTotal', label: 'Prix total' },
  { value: 'prixM2', label: 'Prix au m²' },
];

function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: 600,
        color: s.color,
        background: s.bg,
        borderRadius: '999px',
        padding: '3px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

const controlStyle: CSSProperties = {
  border: '1px solid #DADEE8',
  borderRadius: '8px',
  padding: '8px 11px',
  fontFamily: SANS,
  fontSize: '13px',
  color: '#161A2E',
  background: '#FFFFFF',
  outline: 'none',
};

export function TerrainsTable({ terrains }: { terrains: TerrainListItem[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TerrainSortKey>('recent');

  const rows = useMemo(() => sortTerrains(filterTerrains(terrains, query), sort), [terrains, query, sort]);

  return (
    <div>
      {/* Barre recherche + tri */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un terrain (libellé, adresse)"
          aria-label="Rechercher un terrain"
          style={{ ...controlStyle, flex: '1 1 240px', minWidth: 0 }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6C7488', fontWeight: 600 }}>Trier</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as TerrainSortKey)}
            aria-label="Trier les terrains"
            style={{ ...controlStyle, cursor: 'pointer' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #DADEE8',
          borderRadius: '12px',
          overflow: 'hidden',
          minWidth: '560px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '0 16px',
            height: '42px',
            background: '#FAFBFD',
            borderBottom: '1px solid #DADEE8',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#6C7488',
          }}
        >
          <div style={{ flex: 1, minWidth: '170px' }}>Terrain</div>
          <div style={{ width: '104px', textAlign: 'right' }}>Surface</div>
          <div style={{ width: '150px', textAlign: 'right' }}>Prix</div>
          <div style={{ width: '118px' }}>Statut</div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '13.5px', color: '#6C7488' }}>
            Aucun terrain ne correspond à la recherche.
          </div>
        ) : (
          rows.map((terrain) => {
            const ratio = prixM2Of(terrain);
            const prixM2 = ratio != null ? Math.round(ratio) : null;
            return (
              <Link
                key={terrain.id}
                href={`/terrains/${terrain.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 16px',
                  borderBottom: '1px solid #EFF1F6',
                  textDecoration: 'none',
                  color: '#161A2E',
                }}
              >
                <div style={{ flex: 1, minWidth: '170px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#161A2E', lineHeight: 1.25 }}>
                    {terrain.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6C7488' }}>{terrain.address}</div>
                </div>
                <div style={{ width: '104px', textAlign: 'right', fontFamily: MONO, fontSize: '12.5px', color: '#343B4D' }}>
                  {surfaceFormat.format(terrain.surfaceTotaleM2)} m²
                </div>
                <div style={{ width: '150px', textAlign: 'right' }}>
                  {terrain.prixDemande != null ? (
                    <>
                      <div style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 500, color: '#161A2E' }}>
                        {prixFormat.format(terrain.prixDemande)}
                      </div>
                      {prixM2 != null ? (
                        <div style={{ fontFamily: MONO, fontSize: '11px', color: '#98A0B0' }}>
                          {surfaceFormat.format(prixM2)} €/m²
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#98A0B0', fontStyle: 'italic' }}>Indisponible</div>
                  )}
                </div>
                <div style={{ width: '118px' }}>
                  <StatusBadge status={terrain.status} />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
