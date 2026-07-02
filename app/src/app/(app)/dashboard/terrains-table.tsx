'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Input, StatusPin, cn } from '@veriterra/ui';
import {
  filterTerrains,
  prixM2 as prixM2Of,
  sortTerrains,
  type SortDirection,
  type TerrainListItem,
  type TerrainSortKey,
} from '@/modules/terrains/terrain-list';
import { statusMeta } from '@/modules/terrains/status';

// Îlot client : recherche et tri de la liste des terrains (US-5.9). Tri déclenché en cliquant
// l'en-tête de colonne (plus de select box) : reclic sur la même colonne bascule le sens
// (chevron ▲/▼). En tokens du design system (Card, Input, StatusPin, Badge), plus d'hex inline.

const surfaceFormat = new Intl.NumberFormat('fr-FR');
const prixFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Sens de tri par défaut au premier clic sur une colonne (alphabétique croissant, sinon décroissant). */
function defaultDirection(key: TerrainSortKey): SortDirection {
  return key === 'label' ? 'asc' : 'desc';
}

/** En-tête de colonne cliquable (défini hors du composant pour ne pas remonter à chaque rendu,
 *  ce qui perdrait le focus clavier). Affiche un chevron sur la colonne active. */
function SortHeader({
  label,
  sortAs,
  activeKey,
  direction,
  onSort,
  align = 'left',
}: {
  label: string;
  sortAs: TerrainSortKey;
  activeKey: TerrainSortKey;
  direction: SortDirection;
  onSort: (key: TerrainSortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = activeKey === sortAs;
  return (
    <button
      type="button"
      onClick={() => onSort(sortAs)}
      aria-label={`Trier par ${label}${active ? (direction === 'asc' ? ', ordre croissant' : ', ordre décroissant') : ''}`}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'text-indigo-500' : 'text-neutral-500 hover:text-neutral-700',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      <span aria-hidden="true" className="text-[9px] leading-none">
        {active ? (direction === 'asc' ? '▲' : '▼') : ''}
      </span>
    </button>
  );
}

/** Bande de couleur du score (vert haut, indigo moyen, ambre bas, rouge faible), en tokens. */
function scoreBandClass(s: number): string {
  if (s >= 75) return 'bg-success';
  if (s >= 50) return 'bg-indigo-500';
  if (s >= 30) return 'bg-amber-500';
  return 'bg-danger';
}

/** Pastille de score comparatif + indicateur d'alertes rouges. */
function ScoreCell({ score, redFlags }: { score?: number | null; redFlags?: number }) {
  return (
    <div className="flex w-24 items-center gap-1.5">
      {score != null ? (
        <span
          className={cn(
            'min-w-[30px] rounded-md px-1.5 py-0.5 text-center font-mono text-[13px] font-semibold tabular-nums text-white',
            scoreBandClass(score),
          )}
        >
          {score}
        </span>
      ) : (
        <span className="text-[11px] italic text-neutral-400">non évalué</span>
      )}
      {redFlags && redFlags > 0 ? (
        <span
          title={`${redFlags} alerte${redFlags > 1 ? 's' : ''} rouge${redFlags > 1 ? 's' : ''}`}
          className="text-[11px] font-bold text-danger"
        >
          ⚑{redFlags}
        </span>
      ) : null}
    </div>
  );
}

export function TerrainsTable({ terrains }: { terrains: TerrainListItem[] }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<TerrainSortKey>('recent');
  const [direction, setDirection] = useState<SortDirection>('desc');

  const rows = useMemo(
    () => sortTerrains(filterTerrains(terrains, query), sortKey, direction),
    [terrains, query, sortKey, direction],
  );

  function onSort(key: TerrainSortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection(defaultDirection(key));
    }
  }

  const headerProps = { activeKey: sortKey, direction, onSort };

  return (
    <div>
      {/* Recherche */}
      <div className="mb-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un terrain (libellé, adresse)"
          aria-label="Rechercher un terrain"
          className="max-w-sm"
        />
      </div>

      <div className="min-w-[640px] overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {/* En-têtes de colonnes (tri au clic) */}
        <div className="flex h-[42px] items-center gap-3 border-b border-border bg-neutral-50 px-4">
          <div className="min-w-[170px] flex-1">
            <SortHeader label="Terrain" sortAs="label" {...headerProps} />
          </div>
          <div className="w-24">
            <SortHeader label="Score" sortAs="score" {...headerProps} />
          </div>
          <div className="flex w-[104px] justify-end">
            <SortHeader label="Surface" sortAs="surface" align="right" {...headerProps} />
          </div>
          <div className="flex w-[150px] justify-end">
            <SortHeader label="Prix" sortAs="prixTotal" align="right" {...headerProps} />
          </div>
          <div className="w-[118px] text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">Statut</div>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-7 text-center text-sm text-neutral-500">
            Aucun terrain ne correspond à la recherche.
          </div>
        ) : (
          rows.map((terrain) => {
            const ratio = prixM2Of(terrain);
            const pm2 = ratio != null ? Math.round(ratio) : null;
            const meta = statusMeta(terrain.status);
            return (
              <Link
                key={terrain.id}
                href={`/terrains/${terrain.id}`}
                className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 text-foreground transition-colors last:border-b-0 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="min-w-[170px] flex-1">
                  <div className="text-sm font-semibold leading-tight text-foreground">{terrain.label}</div>
                  <div className="text-xs text-neutral-500">{terrain.address}</div>
                </div>
                <ScoreCell score={terrain.score} redFlags={terrain.redFlags} />
                <div className="w-[104px] text-right font-mono text-xs tabular-nums text-neutral-700">
                  {surfaceFormat.format(terrain.surfaceTotaleM2)} m²
                </div>
                <div className="w-[150px] text-right">
                  {terrain.prixDemande != null ? (
                    <>
                      <div className="font-mono text-[13px] tabular-nums text-foreground">
                        {prixFormat.format(terrain.prixDemande)}
                      </div>
                      {pm2 != null ? (
                        <div className="font-mono text-[11px] tabular-nums text-neutral-400">
                          {surfaceFormat.format(pm2)} €/m²
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-xs italic text-neutral-400">Indisponible</div>
                  )}
                </div>
                <div className="flex w-[118px] items-center gap-2">
                  <StatusPin status={meta.pin} />
                  <Badge variant={meta.badge}>{meta.label}</Badge>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
