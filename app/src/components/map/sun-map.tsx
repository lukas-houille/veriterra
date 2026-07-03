'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Map as MaplibreMap, NavigationControl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { applyVeriterraPlanTint, basemapStyle, ensureCadastreOverlay } from './map-style';
import { parcellesCentroid } from '@/lib/geo/centroid';
import { allShadows, sunPosition, type ShadowBuilding, type SunPos } from '@/lib/sun/shadows';
import { ambienceForAltitude, type Ambience } from '@/lib/sun/ambience';
import type { GeoJsonGeometry } from '@/lib/geo/types';

// Vue « Soleil » (US-4.1/4.2) : vue 3D pitchée de la parcelle drapée sur le relief (MNT Terrarium,
// exagéré 1,2x), bâtiments voisins extrudés (BD TOPO) et OMBRES PORTÉES AU SOL (Turf) qui bougent
// avec la date et l'heure, sous une AMBIANCE jour/nuit (ciel, teinte des façades et des ombres,
// voile). Les ombres sont une projection SIMPLIFIÉE sur plan horizontal (longueur = hauteur/tan),
// affichées drapées sur le relief mais non calculées pente par pente. L'ambiance est un voile
// visuel, pas de la donnée (règles 1 et 3) ; la physique des ombres est inchangée. Îlot strictement
// client. Source des bâtiments injectée par URL, donc réutilisable hors fiche (explorer).

interface Batiment {
  id: string;
  geometry: GeoJsonGeometry;
  hauteur: number | null;
}

const AMBER = '#db9b2c';
const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'Spline Sans Mono', ui-monospace, monospace";
const PANEL = '#FFFFFF';
const BORDER = '#DADEE8';
const TEXT = '#161A2E';
const SUB = '#6C7488';

const SHADOW_SOURCE = 'sun-shadows';
const BUILDING_SOURCE = 'sun-buildings';
const PARCELLE_SOURCE = 'sun-parcelle';
const TERRAIN_SOURCE = 'sun-terrain-dem';

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Cap boussole en libellé 8 directions (pour lire l'azimut du soleil). */
const COMPASS8 = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
function compassLabel(deg: number): string {
  return COMPASS8[Math.round((((deg % 360) + 360) % 360) / 45) % 8] ?? 'Nord';
}

function buildingsFC(bats: Batiment[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: bats.map((b) => ({
      type: 'Feature',
      geometry: b.geometry as GeoJSON.Geometry,
      properties: { hauteur: b.hauteur },
    })),
  };
}

function parcelleFC(parcelles: Array<{ geojson: GeoJsonGeometry }>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: parcelles.map((p) => ({ type: 'Feature', geometry: p.geojson as GeoJSON.Geometry, properties: {} })),
  };
}

/** Installe (idempotent) les sources et couches sur le style courant. */
function installLayers(map: MaplibreMap, parcelles: Array<{ geojson: GeoJsonGeometry }>): void {
  applyVeriterraPlanTint(map);
  // Surcouche cadastre unique (PCI) : même trame parcellaire + numéros que l'explorer, autour de la parcelle.
  ensureCadastreOverlay(map);

  for (const [id, data] of [
    [SHADOW_SOURCE, EMPTY_FC],
    [BUILDING_SOURCE, EMPTY_FC],
    [PARCELLE_SOURCE, parcelleFC(parcelles)],
  ] as const) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data });
  }

  // Ombres au sol (sous les volumes), semi-transparentes.
  if (!map.getLayer('sun-shadow-fill')) {
    map.addLayer({
      id: 'sun-shadow-fill',
      type: 'fill',
      source: SHADOW_SOURCE,
      paint: { 'fill-color': '#1a2036', 'fill-opacity': 0.28 },
    });
  }
  // Contour parcelle en ambre.
  if (!map.getLayer('sun-parcelle-fill')) {
    map.addLayer({
      id: 'sun-parcelle-fill',
      type: 'fill',
      source: PARCELLE_SOURCE,
      paint: { 'fill-color': AMBER, 'fill-opacity': 0.2 },
    });
  }
  if (!map.getLayer('sun-parcelle-line')) {
    map.addLayer({
      id: 'sun-parcelle-line',
      type: 'line',
      source: PARCELLE_SOURCE,
      paint: { 'line-color': AMBER, 'line-width': 2.5 },
    });
  }
  // Bâtiments extrudés (hauteur BD TOPO ; sans hauteur => 0, non extrudé).
  if (!map.getLayer('sun-buildings-3d')) {
    map.addLayer({
      id: 'sun-buildings-3d',
      type: 'fill-extrusion',
      source: BUILDING_SOURCE,
      paint: {
        'fill-extrusion-color': '#c7ccda',
        'fill-extrusion-height': ['coalesce', ['get', 'hauteur'], 0],
        'fill-extrusion-opacity': 0.92,
      },
    });
  }

  // Relief : MNT mondial Terrarium (AWS Open Data, libre, CORS *). Le bâti et les ombres au sol
  // reposent alors sur le relief réel (US-4.2), ce qui lève la confusion du sol plat.
  if (!map.getSource(TERRAIN_SOURCE)) {
    map.addSource(TERRAIN_SOURCE, {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Relief : Terrarium (Mapzen, AWS Open Data)',
    });
  }
  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1.2 });
}

const controlPanel: CSSProperties = {
  position: 'absolute',
  left: '12px',
  bottom: '12px',
  zIndex: 10,
  maxWidth: 'calc(100% - 24px)',
  width: '320px',
  background: PANEL,
  border: `1px solid ${BORDER}`,
  borderRadius: '11px',
  padding: '12px 14px',
  boxShadow: '0 8px 24px -12px rgba(16,20,34,0.4)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  fontFamily: SANS,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Construit une Date locale (heure au poignet) depuis une date AAAA-MM-JJ et des minutes du jour. */
function localDate(dateStr: string, minutes: number): Date {
  return new Date(`${dateStr}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`);
}

export function SunMap({
  buildingsUrl,
  parcelles,
  fill = false,
}: {
  /** URL renvoyant { batiments } (fiche : route terrain scopée ; explorer : route bbox). */
  buildingsUrl: string;
  parcelles: Array<{ geojson: GeoJsonGeometry }>;
  /** Remplit la hauteur du parent (modale plein écran) au lieu des 520px de l'onglet. */
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [buildings, setBuildings] = useState<Batiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateStr, setDateStr] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [minutes, setMinutes] = useState<number>(14 * 60); // 14:00 par défaut

  const centroid = useMemo(() => parcellesCentroid(parcelles), [parcelles]);
  const sun: SunPos | null = useMemo(
    () => (centroid ? sunPosition(localDate(dateStr, minutes), centroid.lat, centroid.lon) : null),
    [centroid, dateStr, minutes],
  );
  const ambience: Ambience | null = useMemo(
    () => (sun ? ambienceForAltitude(sun.altitudeDeg) : null),
    [sun],
  );

  const parcellesRef = useRef(parcelles);
  parcellesRef.current = parcelles;

  // Montage de la carte (une fois, côté navigateur).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !centroid) return;
    const map = new MaplibreMap({
      container,
      style: basemapStyle('plan'),
      center: [centroid.lon, centroid.lat],
      zoom: 16.5,
      pitch: 55,
      bearing: -20,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      installLayers(map, parcellesRef.current);
      setMapReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // Le centroïde est stable pour une fiche donnée ; on ne recrée pas la carte à chaque rendu
    // (patron des cartes existantes : montage unique, réinjection des données via les effets suivants).
  }, []);

  // Chargement des bâtiments BD TOPO depuis l'URL injectée (route serveur, source publique IGN).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(buildingsUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`code ${res.status}`);
        return (await res.json()) as { batiments?: Batiment[] };
      })
      .then((data) => {
        if (!cancelled) setBuildings(Array.isArray(data.batiments) ? data.batiments : []);
      })
      .catch(() => {
        if (!cancelled) setError('Bâtiments indisponibles (BD TOPO injoignable).');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildingsUrl]);

  // Injecte les bâtiments dans la carte quand ils arrivent.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource(BUILDING_SOURCE) as GeoJSONSource | undefined)?.setData(buildingsFC(buildings));
  }, [buildings, mapReady]);

  // Recalcule et injecte les ombres à chaque changement de soleil/bâtiments.
  const shadowResult = useMemo(() => {
    if (!sun) return { shadows: [], sansHauteur: 0 };
    const inputs: ShadowBuilding[] = buildings.map((b) => ({
      geometry: b.geometry as ShadowBuilding['geometry'],
      hauteur: b.hauteur,
    }));
    return allShadows(inputs, sun);
  }, [buildings, sun]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource(SHADOW_SOURCE) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: shadowResult.shadows,
    });
  }, [shadowResult, mapReady]);

  // Ambiance jour/nuit : ciel, teinte des façades et des ombres selon la hauteur du soleil.
  // Uniquement des uniformes (coût quasi nul), sûrs à réappliquer à chaque pas du curseur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !ambience) return;
    map.setSky(ambience.sky);
    map.setPaintProperty('sun-buildings-3d', 'fill-extrusion-color', ambience.buildingColor);
    map.setPaintProperty('sun-shadow-fill', 'fill-color', ambience.shadowColor);
    map.setPaintProperty('sun-shadow-fill', 'fill-opacity', ambience.shadowOpacity);
  }, [ambience, mapReady]);

  const daylight = sun != null && sun.altitudeDeg > 0.5;
  const timeLabel = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

  return (
    <div
      style={{
        position: 'relative',
        height: fill ? '100%' : '520px',
        width: '100%',
        borderRadius: fill ? 0 : '12px',
        overflow: 'hidden',
        border: fill ? 'none' : `1px solid ${BORDER}`,
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} aria-label="Vue 3D de l'ensoleillement" />

      {/* Voile d'ambiance (réchauffe le jour/crépuscule, assombrit la nuit). Sous le panneau. */}
      {ambience && ambience.overlay.opacity > 0.001 ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            pointerEvents: 'none',
            background: ambience.overlay.color,
            opacity: ambience.overlay.opacity,
            mixBlendMode: ambience.overlay.blend,
          }}
        />
      ) : null}

      <div style={controlPanel}>
        <span style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: SUB, fontWeight: 700 }}>
          Ensoleillement
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            aria-label="Date"
            style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '6px 9px', fontFamily: SANS, fontSize: '13px', color: TEXT }}
          />
          <span style={{ fontFamily: MONO, fontSize: '14px', color: TEXT, minWidth: '46px', textAlign: 'right' }}>{timeLabel}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1439}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          aria-label="Heure"
          style={{ width: '100%' }}
        />
        <p style={{ margin: 0, fontSize: '12.5px', color: TEXT }}>
          {sun == null ? (
            'Parcelle sans géométrie.'
          ) : daylight ? (
            <>
              Soleil : {compassLabel(sun.azimuthDeg)} ({Math.round(sun.azimuthDeg)}°), hauteur{' '}
              <span style={{ fontFamily: MONO }}>{Math.round(sun.altitudeDeg)}°</span>
            </>
          ) : (
            'Soleil sous l\'horizon (pas d\'ombre).'
          )}
        </p>
        {loading ? (
          <p style={{ margin: 0, fontSize: '12px', color: SUB }}>Chargement des bâtiments...</p>
        ) : error ? (
          <p style={{ margin: 0, fontSize: '12px', color: '#C0432E' }}>{error}</p>
        ) : (
          <p style={{ margin: 0, fontSize: '11.5px', color: SUB }}>
            {buildings.length} bâtiment{buildings.length > 1 ? 's' : ''} voisin{buildings.length > 1 ? 's' : ''} (BD TOPO)
            {shadowResult.sansHauteur > 0 ? `, dont ${shadowResult.sansHauteur} sans hauteur connue (non ombrés)` : ''}. Ombres projetées au sol (méthode simplifiée), drapées sur le relief (MNT Terrarium, exagéré 1,2x).
          </p>
        )}
      </div>
    </div>
  );
}

export default SunMap;
