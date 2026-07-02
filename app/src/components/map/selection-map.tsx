'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map as MaplibreMap,
  NavigationControl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CSSProperties } from 'react';
import {
  applyVeriterraPlanTint,
  basemapStyle,
  DEFAULT_BASEMAP,
  FRANCE_CENTER,
  FRANCE_ZOOM,
  type BasemapId,
} from './map-style';
import { searchAddress, zoomForBanType } from '@/lib/geo/ban';
import {
  fetchParcelleAtPoint,
  fetchParcellesInBbox,
  filterBySurface,
  type ParcelleInZone,
} from '@/lib/geo/apicarto-core';
import type { BanFeature, GeoJsonGeometry } from '@/lib/geo/types';

/** Parcelle retenue dans la sélection courante (remontée au parent). */
export interface SelectedParcelle {
  idu: string;
  geojson: GeoJsonGeometry;
  surfaceM2: number;
  commune: string;
  section: string;
  numero: string;
}

interface SelectionMapProps {
  /** Notifie le parent à chaque changement de la sélection de parcelles. */
  onSelectionChange: (parcelles: SelectedParcelle[]) => void;
  /** Notifie le parent quand une adresse est choisie (code INSEE + libellé). */
  onAddressPick: (address: { insee: string; address: string }) => void;
}

const AMBER = '#db9b2c';
const INDIGO = '#2F3B6E';
const SELECTION_SOURCE = 'selection';
const SURFACE_SOURCE = 'surface-matches';

// US-1.6 : garde-fous de la recherche par surface.
const MIN_SEARCH_ZOOM = 14;
const DEFAULT_TOLERANCE_M2 = 100;

// Jetons visuels de la maquette « Explorer » (docs/design/handoff/Explorer.dc.html).
const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'Spline Sans Mono', ui-monospace, monospace";
const PANEL = '#FFFFFF';
const BORDER = '#DADEE8';
const TEXT = '#161A2E';
const SUB = '#6C7488';
const MICRO = '#98A0B0';
const FLOAT_SHADOW = '0 8px 24px -12px rgba(16,20,34,0.4)';

const microLabel: CSSProperties = {
  fontSize: '10px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: MICRO,
  fontWeight: 600,
};

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as unknown[] };

type SetDataArg = Parameters<GeoJSONSource['setData']>[0];

/** Construit la FeatureCollection GeoJSON des parcelles sélectionnées (surlignage ambre). */
function toFeatureCollection(parcelles: SelectedParcelle[]) {
  return {
    type: 'FeatureCollection' as const,
    features: parcelles.map((p) => ({
      type: 'Feature' as const,
      properties: { idu: p.idu },
      geometry: p.geojson,
    })),
  };
}

/** Construit la FeatureCollection des parcelles trouvées par surface (surlignage indigo). */
function toMatchCollection(parcelles: ParcelleInZone[]) {
  return {
    type: 'FeatureCollection' as const,
    features: parcelles.map((p) => ({
      type: 'Feature' as const,
      properties: { idu: p.idu },
      geometry: p.geojson,
    })),
  };
}

/** Formatage métrique français d'une surface en m². */
function formatSurface(m2: number): string {
  return `${Math.round(m2).toLocaleString('fr-FR')} m²`;
}

/**
 * (Ré)installe les calques applicatifs sur le style courant : recoloration Veriterra du plan,
 * calques de résultats par surface (indigo, dessous) et de sélection (ambre, dessus), puis
 * réinjecte les données. Idempotent. À rappeler après chaque chargement de style (au montage
 * comme après une bascule de fond de carte, qui remet le style à zéro).
 */
function installOverlays(
  map: MaplibreMap,
  basemap: BasemapId,
  selection: SelectedParcelle[],
  matches: ParcelleInZone[],
): void {
  if (basemap === 'plan') applyVeriterraPlanTint(map);

  if (!map.getSource(SURFACE_SOURCE)) {
    map.addSource(SURFACE_SOURCE, { type: 'geojson', data: EMPTY_FC as SetDataArg });
  }
  if (!map.getLayer('surface-fill')) {
    map.addLayer({
      id: 'surface-fill',
      type: 'fill',
      source: SURFACE_SOURCE,
      paint: { 'fill-color': INDIGO, 'fill-opacity': 0.22 },
    });
  }
  if (!map.getLayer('surface-line')) {
    map.addLayer({
      id: 'surface-line',
      type: 'line',
      source: SURFACE_SOURCE,
      paint: { 'line-color': INDIGO, 'line-width': 1.5 },
    });
  }

  if (!map.getSource(SELECTION_SOURCE)) {
    map.addSource(SELECTION_SOURCE, { type: 'geojson', data: EMPTY_FC as SetDataArg });
  }
  if (!map.getLayer('selection-fill')) {
    map.addLayer({
      id: 'selection-fill',
      type: 'fill',
      source: SELECTION_SOURCE,
      paint: { 'fill-color': AMBER, 'fill-opacity': 0.4 },
    });
  }
  // Liseré de contraste (casing) sombre SOUS le trait ambre : la sélection reste lisible sur
  // l'orthophoto satellite (fonds verts/bruns saturés) où l'ambre seul se noyait.
  if (!map.getLayer('selection-casing')) {
    map.addLayer({
      id: 'selection-casing',
      type: 'line',
      source: SELECTION_SOURCE,
      paint: { 'line-color': '#161A2E', 'line-width': 4.5, 'line-opacity': 0.55 },
    });
  }
  if (!map.getLayer('selection-line')) {
    map.addLayer({
      id: 'selection-line',
      type: 'line',
      source: SELECTION_SOURCE,
      paint: { 'line-color': AMBER, 'line-width': 2.5 },
    });
  }

  (map.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined)?.setData(
    toFeatureCollection(selection) as SetDataArg,
  );
  (map.getSource(SURFACE_SOURCE) as GeoJSONSource | undefined)?.setData(
    toMatchCollection(matches) as SetDataArg,
  );
}

/**
 * Carte de sélection de parcelles (US-1.1 / US-1.2 / US-1.6). Fond de carte au choix
 * (plan vectoriel Veriterra ou satellite IGN, cadastre en calque), recherche d'adresse
 * (BAN) avec autocomplétion, sélection de parcelles au clic (API Carto Cadastre) surlignées
 * en ambre, et recherche par surface approchée dans la zone visible (parcelles proches
 * surlignées en indigo, cliquables pour les ajouter). Composant client, robuste au SSR :
 * la carte MapLibre n'est créée que dans un effet, côté navigateur.
 */
export function SelectionMap({ onSelectionChange, onAddressPick }: SelectionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [selection, setSelection] = useState<SelectedParcelle[]>([]);
  const [matches, setMatches] = useState<ParcelleInZone[]>([]);
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);

  // Miroirs pour réinjecter les données après un rechargement de style (closures fraîches).
  const selectionRef = useRef(selection);
  const matchesRef = useRef(matches);
  const basemapRef = useRef(basemap);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [surfaceTarget, setSurfaceTarget] = useState('');
  const [surfaceTolerance, setSurfaceTolerance] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const [clickLoading, setClickLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialisation de la carte (une seule fois, côté navigateur uniquement).
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: basemapStyle(DEFAULT_BASEMAP),
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Zoom natif MapLibre en bas-droite (la carte contextuelle occupe le haut-droite).
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      installOverlays(map, basemapRef.current, selectionRef.current, matchesRef.current);
      setMapReady(true);
    });

    const toggleSelection = (parcelle: SelectedParcelle) =>
      setSelection((prev) => {
        const exists = prev.some((p) => p.idu === parcelle.idu);
        if (exists) return prev.filter((p) => p.idu !== parcelle.idu);
        return [...prev, parcelle];
      });

    map.on('click', (e) => {
      setError(null);
      // Si le clic tombe sur une parcelle déjà trouvée par la recherche par surface, on
      // l'ajoute directement depuis la donnée en cache (déjà autoritative, aucun réseau).
      if (map.getLayer('surface-fill')) {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['surface-fill'] })[0];
        const hitIdu = hit?.properties?.idu;
        if (typeof hitIdu === 'string') {
          const match = matchesRef.current.find((m) => m.idu === hitIdu);
          if (match) {
            toggleSelection(match);
            return;
          }
        }
      }
      setClickLoading(true);
      void fetchParcelleAtPoint(e.lngLat.lng, e.lngLat.lat)
        .then((parcelle) => {
          if (!parcelle) {
            setError('Aucune parcelle cadastrale à cet endroit (hors couverture vecteur).');
            return;
          }
          toggleSelection({
            idu: parcelle.idu,
            geojson: parcelle.geojson,
            surfaceM2: parcelle.surfaceM2,
            commune: parcelle.commune,
            section: parcelle.section,
            numero: parcelle.numero,
          });
        })
        .catch(() => {
          setError('Échec de la récupération de la parcelle (API Carto).');
        })
        .finally(() => setClickLoading(false));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Synchronise le surlignage de sélection (ambre) et remonte la sélection au parent.
  useEffect(() => {
    selectionRef.current = selection;
    const map = mapRef.current;
    if (map && mapReady) {
      (map.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined)?.setData(
        toFeatureCollection(selection) as SetDataArg,
      );
    }
    onSelectionChange(selection);
  }, [selection, mapReady, onSelectionChange]);

  // Synchronise le surlignage des résultats par surface (indigo).
  useEffect(() => {
    matchesRef.current = matches;
    const map = mapRef.current;
    if (map && mapReady) {
      (map.getSource(SURFACE_SOURCE) as GeoJSONSource | undefined)?.setData(
        toMatchCollection(matches) as SetDataArg,
      );
    }
  }, [matches, mapReady]);

  // Autocomplétion d'adresse avec debounce simple.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchAddress(q)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const pickAddress = useCallback(
    (feature: BanFeature) => {
      setQuery(feature.label);
      setShowSuggestions(false);
      setSuggestions([]);
      onAddressPick({ insee: feature.citycode, address: feature.label });
      // Zoom adapté à la granularité du résultat : une commune ne doit pas cadrer comme un
      // numéro de rue (le zoom 18 fixe « zoomait trop » sur une ville).
      mapRef.current?.flyTo({ center: [feature.lon, feature.lat], zoom: zoomForBanType(feature.type) });
    },
    [onAddressPick],
  );

  // Bascule de fond de carte : recharge le style puis réinstalle les calques applicatifs
  // (setStyle remet le style à zéro, y compris nos sources/couches).
  const switchBasemap = useCallback(
    (next: BasemapId) => {
      const map = mapRef.current;
      if (!map || next === basemapRef.current) return;
      basemapRef.current = next;
      setBasemap(next);
      setMapReady(false);
      // diff:false force un nouveau Style (loaded()===false) : un fond « plan » est chargé
      // par URL de façon asynchrone, et setStyle avec diff laisserait isStyleLoaded() vrai sur
      // l'ancien style, si bien que reinstall poserait les calques sur le style sortant (effacés
      // ensuite par le diff). Le rebuild complet fait attendre reinstall le vrai nouveau style.
      map.setStyle(basemapStyle(next), { diff: false });
      // Le nouveau document de style est appliqué au premier `styledata` après setStyle : ses
      // sources sont alors déclarées (getSource(...) truthy) et on peut réinstaller nos calques
      // par-dessus. NE PAS gater sur isStyleLoaded() (vrai seulement une fois toutes les tuiles
      // chargées, signalé par 'idle'/'sourcedata') : le once('styledata') gardé ratait souvent
      // l'instant et les parcelles ne revenaient jamais au retour en vue plan.
      map.once('styledata', () => {
        installOverlays(map, next, selectionRef.current, matchesRef.current);
        setMapReady(true);
      });
    },
    [],
  );

  const runSurfaceSearch = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setSearchMsg(null);

    const target = Number(surfaceTarget.replace(',', '.'));
    const rawTol = surfaceTolerance.trim();
    const tol = rawTol === '' ? DEFAULT_TOLERANCE_M2 : Number(rawTol.replace(',', '.'));

    if (!Number.isFinite(target) || target <= 0) {
      setSearchMsg('Indiquez une surface cible (m²).');
      return;
    }
    if (!Number.isFinite(tol) || tol < 0) {
      setSearchMsg('Tolérance invalide.');
      return;
    }
    if (map.getZoom() < MIN_SEARCH_ZOOM) {
      setSearchMsg('Zoomez sur une zone (rue, quartier) pour lancer la recherche.');
      return;
    }

    const b = map.getBounds();
    const bbox: [number, number, number, number] = [
      b.getWest(),
      b.getSouth(),
      b.getEast(),
      b.getNorth(),
    ];

    setSearching(true);
    void fetchParcellesInBbox(bbox)
      .then(({ parcelles, truncated }) => {
        const found = filterBySurface(parcelles, target, tol);
        setMatches(found);
        if (found.length === 0) {
          if (truncated) {
            // Résultat partiel : on ne peut pas affirmer l'absence (règle 3).
            setSearchMsg(
              'Zone trop dense pour une recherche exhaustive (résultat partiel). Resserrez la vue puis relancez.',
            );
            return;
          }
          const lo = formatSurface(Math.max(0, target - tol));
          const hi = formatSurface(target + tol);
          setSearchMsg(`Aucune parcelle entre ${lo} et ${hi} dans cette zone.`);
          return;
        }
        const plural = found.length > 1 ? 's' : '';
        const dense = truncated ? ' (zone dense, resserrez pour un résultat complet)' : '';
        setSearchMsg(
          `${found.length} parcelle${plural} proche${plural} de la cible. Cliquez-en une pour l'ajouter.${dense}`,
        );
      })
      .catch(() => {
        setSearchMsg('Échec de la recherche par surface (API Carto).');
      })
      .finally(() => setSearching(false));
  }, [surfaceTarget, surfaceTolerance]);

  const clearSearch = useCallback(() => {
    setMatches([]);
    setSearchMsg(null);
  }, []);

  // US-1.10 : vide la sélection courante (l'effet synchronise le surlignage et remonte au parent).
  const clearSelection = useCallback(() => setSelection([]), []);

  const totalSurface = selection.reduce((acc, p) => acc + p.surfaceM2, 0);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%' }}
        aria-label="Carte de sélection de parcelles"
      />

      {/* Recherche : adresse + surface (haut-gauche) */}
      <div
        style={{
          position: 'absolute',
          left: '16px',
          top: '16px',
          width: '340px',
          maxWidth: 'calc(100% - 32px)',
          zIndex: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: '11px',
            padding: '0 14px',
            height: '46px',
            boxShadow: FLOAT_SHADOW,
          }}
        >
          <span aria-hidden="true" style={{ color: MICRO, fontSize: '16px', lineHeight: 1 }}>
            ⌕
          </span>
          <input
            type="search"
            value={query}
            placeholder="Rechercher une adresse, une commune"
            aria-label="Rechercher une adresse"
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontFamily: SANS,
              fontSize: '14px',
              color: TEXT,
              width: '100%',
            }}
          />
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              maxHeight: '16rem',
              overflowY: 'auto',
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: '11px',
              boxShadow: '0 12px 30px -10px rgba(16,20,34,0.45)',
            }}
          >
            {suggestions.map((feature) => (
              <li key={`${feature.citycode}-${feature.label}`}>
                <button
                  type="button"
                  onClick={() => pickAddress(feature)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    color: TEXT,
                    fontFamily: SANS,
                    fontSize: '13.5px',
                    fontWeight: 500,
                  }}
                >
                  <span aria-hidden="true" style={{ color: MICRO }}>
                    ⌖
                  </span>
                  <span>{feature.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Recherche par surface approchée (US-1.6) */}
        <div
          style={{
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: '11px',
            padding: '10px 12px',
            boxShadow: FLOAT_SHADOW,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={microLabel}>Recherche par surface</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={surfaceTarget}
              onChange={(e) => setSurfaceTarget(e.target.value)}
              placeholder="Surface m²"
              aria-label="Surface cible en m²"
              style={{
                width: '100%',
                border: `1px solid ${BORDER}`,
                borderRadius: '8px',
                padding: '7px 9px',
                fontFamily: MONO,
                fontSize: '13px',
                color: TEXT,
                outline: 'none',
              }}
            />
            <span aria-hidden="true" style={{ color: SUB, fontSize: '13px' }}>
              ±
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={surfaceTolerance}
              onChange={(e) => setSurfaceTolerance(e.target.value)}
              placeholder="100"
              aria-label="Tolérance en m²"
              style={{
                width: '72px',
                border: `1px solid ${BORDER}`,
                borderRadius: '8px',
                padding: '7px 9px',
                fontFamily: MONO,
                fontSize: '13px',
                color: TEXT,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={runSurfaceSearch}
              disabled={searching}
              style={{
                flexShrink: 0,
                border: 'none',
                borderRadius: '8px',
                background: INDIGO,
                color: '#FFFFFF',
                fontFamily: SANS,
                fontSize: '12.5px',
                fontWeight: 600,
                padding: '8px 12px',
                cursor: searching ? 'progress' : 'pointer',
                opacity: searching ? 0.7 : 1,
              }}
            >
              {searching ? '...' : 'Chercher'}
            </button>
          </div>
          {searchMsg && (
            <p style={{ margin: 0, fontSize: '12px', color: SUB, lineHeight: 1.4 }}>{searchMsg}</p>
          )}
          {matches.length > 0 && (
            <button
              type="button"
              onClick={clearSearch}
              style={{
                alignSelf: 'flex-start',
                border: 'none',
                background: 'transparent',
                padding: 0,
                color: INDIGO,
                fontFamily: SANS,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Effacer les résultats
            </button>
          )}
        </div>
      </div>

      {/* Bascule de fond + surface agrégée + indices (bas-gauche) */}
      <div
        style={{
          position: 'absolute',
          left: '16px',
          bottom: '16px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: 'calc(100% - 32px)',
        }}
      >
        <div
          role="group"
          aria-label="Fond de carte"
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: '9px',
            padding: '3px',
            boxShadow: FLOAT_SHADOW,
          }}
        >
          {(['plan', 'satellite'] as const).map((id) => {
            const active = basemap === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => switchBasemap(id)}
                style={{
                  border: 'none',
                  borderRadius: '7px',
                  padding: '5px 12px',
                  fontFamily: SANS,
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: active ? INDIGO : 'transparent',
                  color: active ? '#FFFFFF' : SUB,
                }}
              >
                {id === 'plan' ? 'Plan' : 'Satellite'}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: '9px',
            padding: '8px 12px',
            boxShadow: FLOAT_SHADOW,
          }}
        >
          <span style={microLabel}>
            {selection.length} parcelle{selection.length > 1 ? 's' : ''} · Surface totale
          </span>
          {selection.length === 0 ? (
            <span style={{ fontSize: '13px', color: SUB }}>Cliquez une parcelle sur la carte</span>
          ) : (
            <>
              <span style={{ fontFamily: MONO, fontSize: '14px', color: TEXT }}>{formatSurface(totalSurface)}</span>
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: '4px',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: AMBER,
                  fontFamily: SANS,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Réinitialiser la sélection
              </button>
            </>
          )}
        </div>
        {clickLoading && (
          <span
            style={{
              alignSelf: 'flex-start',
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: '9px',
              padding: '6px 10px',
              fontSize: '12px',
              color: SUB,
              boxShadow: FLOAT_SHADOW,
            }}
          >
            Recherche de la parcelle...
          </span>
        )}
        {error && (
          <span
            role="alert"
            style={{
              maxWidth: '20rem',
              background: '#F8E7E2',
              border: '1px solid #E7C4BC',
              borderRadius: '9px',
              padding: '7px 11px',
              fontSize: '12px',
              color: '#C0432E',
            }}
          >
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
