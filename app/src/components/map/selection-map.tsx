'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map as MaplibreMap,
  NavigationControl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CSSProperties } from 'react';
import { veriterraMapStyle, FRANCE_CENTER, FRANCE_ZOOM } from './map-style';
import { searchAddress } from '@/lib/geo/ban';
import { fetchParcelleAtPoint } from '@/lib/geo/apicarto-core';
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
const SELECTION_SOURCE = 'selection';

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

/** Construit la FeatureCollection GeoJSON des parcelles sélectionnées. */
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

/** Formatage métrique français d'une surface en m². */
function formatSurface(m2: number): string {
  return `${Math.round(m2).toLocaleString('fr-FR')} m²`;
}

/**
 * Carte de sélection de parcelles (US-1.1 / US-1.2). Fond orthophoto + cadastre IGN,
 * recherche d'adresse (BAN) avec autocomplétion, et sélection de parcelles au clic
 * (API Carto Cadastre) surlignées en ambre. Composant client, robuste au SSR :
 * la carte MapLibre n'est créée que dans un effet, côté navigateur.
 */
export function SelectionMap({ onSelectionChange, onAddressPick }: SelectionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [selection, setSelection] = useState<SelectedParcelle[]>([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [clickLoading, setClickLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialisation de la carte (une seule fois, côté navigateur uniquement).
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: veriterraMapStyle,
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Zoom natif MapLibre en bas-droite (la carte contextuelle occupe le haut-droite).
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      map.addSource(SELECTION_SOURCE, {
        type: 'geojson',
        data: EMPTY_FC as Parameters<GeoJSONSource['setData']>[0],
      });
      map.addLayer({
        id: 'selection-fill',
        type: 'fill',
        source: SELECTION_SOURCE,
        paint: { 'fill-color': AMBER, 'fill-opacity': 0.35 },
      });
      map.addLayer({
        id: 'selection-line',
        type: 'line',
        source: SELECTION_SOURCE,
        paint: { 'line-color': AMBER, 'line-width': 2 },
      });
      setMapReady(true);
    });

    map.on('click', (e) => {
      setError(null);
      setClickLoading(true);
      void fetchParcelleAtPoint(e.lngLat.lng, e.lngLat.lat)
        .then((parcelle) => {
          if (!parcelle) {
            setError('Aucune parcelle cadastrale à cet endroit (hors couverture vecteur).');
            return;
          }
          setSelection((prev) => {
            const exists = prev.some((p) => p.idu === parcelle.idu);
            if (exists) return prev.filter((p) => p.idu !== parcelle.idu);
            return [
              ...prev,
              {
                idu: parcelle.idu,
                geojson: parcelle.geojson,
                surfaceM2: parcelle.surfaceM2,
                commune: parcelle.commune,
                section: parcelle.section,
                numero: parcelle.numero,
              },
            ];
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

  // Synchronise le surlignage cartographique et remonte la sélection au parent.
  useEffect(() => {
    const map = mapRef.current;
    if (map && mapReady) {
      const source = map.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined;
      source?.setData(
        toFeatureCollection(selection) as Parameters<GeoJSONSource['setData']>[0],
      );
    }
    onSelectionChange(selection);
  }, [selection, mapReady, onSelectionChange]);

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
      mapRef.current?.flyTo({ center: [feature.lon, feature.lat], zoom: 18 });
    },
    [onAddressPick],
  );

  const totalSurface = selection.reduce((acc, p) => acc + p.surfaceM2, 0);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%' }}
        aria-label="Carte de sélection de parcelles"
      />

      {/* Recherche d'adresse (haut-gauche) */}
      <div
        style={{
          position: 'absolute',
          left: '16px',
          top: '16px',
          width: '340px',
          maxWidth: 'calc(100% - 32px)',
          zIndex: 12,
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
              margin: '6px 0 0',
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
      </div>

      {/* Surface agrégée + indice (bas-gauche) */}
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
            <span style={{ fontFamily: MONO, fontSize: '14px', color: TEXT }}>{formatSurface(totalSurface)}</span>
          )}
        </div>
        <div
          style={{
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: '9px',
            padding: '7px 12px',
            fontSize: '12px',
            color: SUB,
          }}
        >
          Cliquez une parcelle pour la sélectionner
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
