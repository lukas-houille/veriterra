'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import maplibre from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeoJsonGeometry } from '@/lib/geo/types';
import {
  applyVeriterraPlanTint,
  basemapStyle,
  DEFAULT_BASEMAP,
  FRANCE_CENTER,
  FRANCE_ZOOM,
  STATUS_COLORS,
  type BasemapId,
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
const POINTS_SOURCE_ID = 'terrain-points';
const POINTS_LAYER_ID = 'terrains-points';

const INDIGO = '#2F3B6E';
const PANEL = '#FFFFFF';
const BORDER = '#DADEE8';
const SUB = '#6C7488';
const SANS = "'Archivo', system-ui, sans-serif";

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
 * Construit une FeatureCollection de points (un par terrain), placé au centre de l'emprise
 * de ses parcelles. Rend chaque terrain repérable et cliquable même dézoomé, quand les
 * contours de parcelles sont trop petits pour être visibles (pins colorés par statut).
 */
function buildPointCollection(terrains: DashboardMapTerrain[]): FeatureCollection {
  const features: Feature[] = [];
  for (const terrain of terrains) {
    const bounds = new maplibre.LngLatBounds();
    for (const parcelle of terrain.parcelles) {
      extendBounds(bounds, (parcelle.geojson as unknown as { coordinates: unknown }).coordinates);
    }
    if (bounds.isEmpty()) continue;
    const center = bounds.getCenter();
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
      properties: {
        terrainId: terrain.id,
        label: terrain.label,
        color: STATUS_COLORS[terrain.status] ?? FALLBACK_COLOR,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** (Ré)installe les couches des terrains (contours + pins) sur le style courant. */
function installTerrainLayers(
  map: maplibre.Map,
  basemap: BasemapId,
  fc: FeatureCollection,
  points: FeatureCollection,
): void {
  if (basemap === 'plan') applyVeriterraPlanTint(map);

  const source = map.getSource(SOURCE_ID) as maplibre.GeoJSONSource | undefined;
  if (source) source.setData(fc);
  else map.addSource(SOURCE_ID, { type: 'geojson', data: fc });

  const pointSource = map.getSource(POINTS_SOURCE_ID) as maplibre.GeoJSONSource | undefined;
  if (pointSource) pointSource.setData(points);
  else map.addSource(POINTS_SOURCE_ID, { type: 'geojson', data: points });

  if (!map.getLayer(FILL_LAYER_ID)) {
    map.addLayer({
      id: FILL_LAYER_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 },
    });
  }
  if (!map.getLayer(LINE_LAYER_ID)) {
    map.addLayer({
      id: LINE_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
    });
  }
  // Pins colorés par statut, au-dessus des contours, visibles et cliquables à tout zoom.
  if (!map.getLayer(POINTS_LAYER_ID)) {
    map.addLayer({
      id: POINTS_LAYER_ID,
      type: 'circle',
      source: POINTS_SOURCE_ID,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 11, 7, 15, 9],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 0.95,
      },
    });
  }
}

/**
 * Carte du dashboard : superpose les contours des parcelles de chaque terrain sur le fond
 * choisi (plan vectoriel Veriterra ou satellite IGN), colorés par statut de portefeuille, et
 * cadre la vue sur l'ensemble. Un clic sur un terrain ouvre sa fiche, une bascule permet de
 * changer de fond.
 *
 * Composant strictement client ('use client') : `maplibre.Map` n'est instanciée que dans un
 * effet, sur une div montée, et détruite au démontage.
 */
export function DashboardMap({ terrains, className }: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibre.Map | null>(null);
  const router = useRouter();
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const basemapRef = useRef<BasemapId>(DEFAULT_BASEMAP);

  // Sérialisée pour servir de dépendance stable à l'effet (les terrains sont
  // statiques après rendu serveur, mais on reste correct si la prop change).
  const featureCollection = useMemo(
    () => buildFeatureCollection(terrains),
    [terrains],
  );
  const pointCollection = useMemo(() => buildPointCollection(terrains), [terrains]);
  const fcRef = useRef(featureCollection);
  fcRef.current = featureCollection;
  const pointsRef = useRef(pointCollection);
  pointsRef.current = pointCollection;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibre.Map({
      container,
      style: basemapStyle(basemapRef.current),
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

    const onLoad = () => {
      installTerrainLayers(map, basemapRef.current, fcRef.current, pointsRef.current);

      // Cadrage sur l'ensemble des contours (initial seulement).
      const bounds = new maplibre.LngLatBounds();
      for (const feature of fcRef.current.features) {
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
    for (const layer of [FILL_LAYER_ID, POINTS_LAYER_ID]) {
      map.on('click', layer, onClick);
      map.on('mouseenter', layer, onEnter);
      map.on('mouseleave', layer, onLeave);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [featureCollection, router]);

  function switchBasemap(next: BasemapId): void {
    const map = mapRef.current;
    if (!map || next === basemapRef.current) return;
    basemapRef.current = next;
    setBasemap(next);
    // diff:false force un rebuild complet du style : un fond « plan » chargé par URL l'est de
    // façon asynchrone, et setStyle avec diff laisserait isStyleLoaded() vrai sur l'ancien
    // style (reinstall poserait alors les couches sur le style sortant, effacées par le diff).
    map.setStyle(basemapStyle(next), { diff: false });
    const reinstall = () => {
      if (!map.isStyleLoaded()) {
        map.once('styledata', reinstall);
        return;
      }
      installTerrainLayers(map, next, fcRef.current, pointsRef.current);
    };
    reinstall();
  }

  return (
    <div
      className={className}
      role="region"
      aria-label="Carte des terrains suivis"
      style={{ position: 'relative' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div
        role="group"
        aria-label="Fond de carte"
        style={{
          position: 'absolute',
          left: '12px',
          bottom: '12px',
          zIndex: 5,
          display: 'inline-flex',
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: '9px',
          padding: '3px',
          boxShadow: '0 8px 24px -12px rgba(16,20,34,0.4)',
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
    </div>
  );
}

export default DashboardMap;
