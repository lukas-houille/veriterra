'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import maplibre from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeoJsonGeometry } from '@/lib/geo/types';
import {
  veriterraMapStyle,
  FRANCE_CENTER,
  FRANCE_ZOOM,
  STATUS_COLORS,
} from './map-style';

/** Terrain minimal nécessaire à l'affichage cartographique (contours + statut). */
export interface DashboardMapTerrain {
  id: string;
  label: string;
  status: string;
  parcelles: Array<{ geojson: GeoJsonGeometry }>;
}

export interface DashboardMapProps {
  terrains: DashboardMapTerrain[];
  className?: string;
}

const SOURCE_ID = 'terrains';
const FILL_LAYER_ID = 'terrains-fill';
const LINE_LAYER_ID = 'terrains-line';

/** Couleur de repli pour un statut inconnu (neutre « à étudier »). */
const FALLBACK_COLOR = STATUS_COLORS.A_ETUDIER ?? '#98a0b0';

/**
 * Construit une FeatureCollection des contours de parcelles, une entité par
 * parcelle, portant l'id du terrain et sa couleur de statut (pilotage data-driven
 * du rendu). Les géométries proviennent d'API Carto (source faisant autorité).
 */
function buildFeatureCollection(
  terrains: DashboardMapTerrain[],
): FeatureCollection {
  const features: Feature[] = [];
  for (const terrain of terrains) {
    const color = STATUS_COLORS[terrain.status] ?? FALLBACK_COLOR;
    for (const parcelle of terrain.parcelles) {
      features.push({
        type: 'Feature',
        geometry: parcelle.geojson as unknown as Geometry,
        properties: {
          terrainId: terrain.id,
          label: terrain.label,
          color,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Étend les bornes à toutes les positions [lng, lat] d'une géométrie imbriquée. */
function extendBounds(bounds: maplibre.LngLatBounds, coords: unknown): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    bounds.extend([coords[0], coords[1]]);
    return;
  }
  for (const child of coords) extendBounds(bounds, child);
}

/**
 * Carte du dashboard : superpose les contours des parcelles de chaque terrain sur
 * le fond IGN, colorés par statut de portefeuille, et cadre la vue sur l'ensemble.
 * Un clic sur un terrain ouvre sa fiche.
 *
 * Composant strictement client ('use client') : `maplibre.Map` n'est instanciée que
 * dans un effet, sur une div montée, et détruite au démontage. Le module maplibre-gl
 * n'accède à `window`/`document` qu'à l'exécution (jamais au chargement), donc le
 * rendu serveur de la div reste sûr (robustesse SSR).
 */
export function DashboardMap({ terrains, className }: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Sérialisée pour servir de dépendance stable à l'effet (les terrains sont
  // statiques après rendu serveur, mais on reste correct si la prop change).
  const featureCollection = useMemo(
    () => buildFeatureCollection(terrains),
    [terrains],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibre.Map({
      container,
      style: veriterraMapStyle,
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

    const onLoad = () => {
      map.addSource(SOURCE_ID, { type: 'geojson', data: featureCollection });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.35,
        },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
      });

      // Cadrage sur l'ensemble des contours (sinon on garde la vue France).
      const bounds = new maplibre.LngLatBounds();
      for (const feature of featureCollection.features) {
        const geom = feature.geometry;
        if (geom.type === 'GeometryCollection') continue;
        extendBounds(bounds, geom.coordinates);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 0 });
      }
    };

    const onClick = (e: maplibre.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const terrainId = feature?.properties?.terrainId;
      if (typeof terrainId === 'string') router.push(`/terrains/${terrainId}`);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('load', onLoad);
    map.on('click', FILL_LAYER_ID, onClick);
    map.on('mouseenter', FILL_LAYER_ID, onEnter);
    map.on('mouseleave', FILL_LAYER_ID, onLeave);

    return () => {
      map.remove();
    };
  }, [featureCollection, router]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="region"
      aria-label="Carte des terrains suivis"
    />
  );
}

export default DashboardMap;
