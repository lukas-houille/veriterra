'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Input, cn } from '@veriterra/ui';
import {
  filterTerrains,
  prixM2 as prixM2Of,
  sortTerrains,
  type SortDirection,
  type TerrainListItem,
  type TerrainSortKey,
} from '@/modules/terrains/terrain-list';
import { StatusChanger } from '@/components/terrains/status-changer';

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

      {/* Tri mobile : les en-têtes de colonnes (tri au clic) sont masqués sous `sm`, on offre
          donc ici un contrôle de tri compact équivalent. */}
      <div className="mb-3 flex items-center gap-2 sm:hidden">
        <label htmlFor="mobile-sort" className="text-xs font-semibold text-neutral-500">
          Trier
        </label>
        <select
          id="mobile-sort"
          value={sortKey}
          onChange={(e) => {
            const key = e.target.value as TerrainSortKey;
            setSortKey(key);
            setDirection(defaultDirection(key));
          }}
          className="h-11 flex-1 rounded-md border border-neutral-200 bg-white px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="recent">Plus récents</option>
          <option value="label">Nom</option>
          <option value="score">Score</option>
          <option value="surface">Surface</option>
          <option value="prixTotal">Prix</option>
        </select>
        <button
          type="button"
          onClick={() => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={direction === 'asc' ? 'Tri croissant, inverser' : 'Tri décroissant, inverser'}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">{direction === 'asc' ? '▲' : '▼'}</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm sm:min-w-[640px]">
        {/* En-têtes de colonnes (tri au clic) : masqués sur mobile (cartes empilées). */}
        <div className="hidden h-[42px] items-center gap-3 border-b border-border bg-neutral-50 px-4 sm:flex">
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
          <div className="w-[184px] text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">Statut</div>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-7 text-center text-sm text-neutral-500">
            Aucun terrain ne correspond à la recherche.
          </div>
        ) : (
          rows.map((terrain) => {
            const ratio = prixM2Of(terrain);
            const pm2 = ratio != null ? Math.round(ratio) : null;
            return (
              <div
                key={terrain.id}
                className="relative flex flex-col gap-2 border-b border-neutral-100 px-4 py-3 text-foreground transition-colors last:border-b-0 hover:bg-neutral-50 sm:flex-row sm:items-center sm:gap-3"
              >
                {/* Lien « étiré » : couvre toute la ligne pour ouvrir la fiche. Le changeur de statut,
                    placé au-dessus (z-[2]), reste interactif SANS déclencher la navigation (motif clic
                    imbriqué invalide évité : le changeur est un frère du lien, pas un enfant). */}
                <Link
                  href={`/terrains/${terrain.id}`}
                  aria-label={`Ouvrir la fiche de ${terrain.label}`}
                  className="absolute inset-0 z-[1] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
                <div className="min-w-0 sm:min-w-[170px] sm:flex-1">
                  <div className="text-sm font-semibold leading-tight text-foreground">{terrain.label}</div>
                  <div className="text-xs text-neutral-500">{terrain.address}</div>
                </div>
                {/* Mobile : les métriques s'enroulent sous le libellé. `sm:contents` dissout ce
                    conteneur au-delà de `sm` pour restituer exactement les colonnes du tableau. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:contents">
                  <ScoreCell score={terrain.score} redFlags={terrain.redFlags} />
                  <div className="font-mono text-xs tabular-nums text-neutral-700 sm:w-[104px] sm:text-right">
                    {surfaceFormat.format(terrain.surfaceTotaleM2)} m²
                  </div>
                  <div className="sm:w-[150px] sm:text-right">
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
                  <StatusChanger terrainId={terrain.id} status={terrain.status} className="relative z-[2] sm:w-[184px]" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
