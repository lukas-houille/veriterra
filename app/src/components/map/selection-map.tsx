'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map as MaplibreMap,
  NavigationControl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Input, cn } from '@veriterra/ui';
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
    map.addControl(new NavigationControl(), 'top-right');

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
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-200">
      <div ref={containerRef} className="h-full w-full" aria-label="Carte de sélection de parcelles" />

      {/* Recherche d'adresse */}
      <div className="absolute left-3 top-3 z-10 w-[min(22rem,calc(100%-1.5rem))]">
        <Input
          type="search"
          value={query}
          placeholder="Rechercher une adresse..."
          aria-label="Rechercher une adresse"
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          className="shadow-sm"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="mt-1 max-h-64 overflow-auto rounded-md border border-neutral-200 bg-card shadow-md">
            {suggestions.map((feature) => (
              <li key={`${feature.citycode}-${feature.label}`}>
                <button
                  type="button"
                  onClick={() => pickAddress(feature)}
                  className={cn(
                    'block w-full px-3 py-2 text-left text-sm text-foreground',
                    'hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none',
                  )}
                >
                  {feature.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Surface agrégée + état de chargement / erreur */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1">
        <div className="rounded-md border border-neutral-200 bg-card px-3 py-2 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {selection.length} parcelle{selection.length > 1 ? 's' : ''} · Surface totale
          </span>
          {selection.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cliquez une parcelle sur la carte</p>
          ) : (
            <p className="font-mono text-sm text-foreground">{formatSurface(totalSurface)}</p>
          )}
        </div>
        {clickLoading && (
          <span className="rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">
            Recherche de la parcelle...
          </span>
        )}
        {error && (
          <span className="max-w-xs rounded-md border border-neutral-200 bg-card px-2 py-1 text-xs text-danger shadow-sm">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
