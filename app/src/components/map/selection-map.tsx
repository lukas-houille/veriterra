'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ensureCadastreOverlay,
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
import { parcellesCentroid } from '@/lib/geo/centroid';
import { boundsOfGeometries } from '@/lib/geo/bbox';
import {
  fetchElevations,
  formatMeters,
  formatPercent,
  formatSignedMeters,
  formatSquareMeters,
  isSelfIntersectingRing,
  lineLengthMeters,
  nearestBoundaryDistance,
  polygonAreaMeters,
  polygonPerimeterMeters,
  ringCentroid,
  segmentMidpoint,
  slopeBetween,
  type LngLat,
} from '@/lib/geo/measure';
import { ambienceForAltitude } from '@/lib/sun/ambience';
import { sunPosition } from '@/lib/sun/shadows';
import {
  hillshadeExaggeration,
  shadowFadeOpacity,
  sunShadowsFor,
  toExtrusionFC,
  type SunVolume,
} from '@/lib/sun/sun-render';
import { dateForDayOfYear, dayOfYear, seasonLabel, seasonMarks, timestampFor } from '@/lib/sun/sun-time';

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
  onSelectionChange?: (parcelles: SelectedParcelle[]) => void;
  /** Notifie le parent quand une adresse est choisie (code INSEE + libellé). */
  onAddressPick?: (address: { insee: string; address: string }) => void;
  /** Sélection initiale (fiche : parcelles du terrain, préchargées et centrées à l'ouverture). */
  initialSelection?: SelectedParcelle[];
  /** Mode focalisé lecture seule (fiche) : pas de recherche d'adresse/surface ni d'édition au clic. */
  readOnly?: boolean;
  /** Si fourni, affiche un bouton « agrandir » (ouvre l'explorer plein écran focalisé sur le terrain). */
  onExpand?: () => void;
}

const AMBER = '#db9b2c';
const INDIGO = '#2F3B6E';
const SELECTION_SOURCE = 'selection';
const SURFACE_SOURCE = 'surface-matches';

// --- Relief permanent + analyse d'ensoleillement en place (natif MapLibre) ----------------------
// Rendu 100 % natif MapLibre (setTerrain + fill-extrusion) : robuste, sans dépendance 3D externe.
// Le relief (MNT) est chargé en PERMANENCE sur les deux fonds ; la carte reste à plat par défaut
// (pitch 0, lisible en 2D) et on l'incline pour voir le relief. Les ombres au sol sont projetées
// par Turf (shadows.ts) et bougent avec l'heure et la saison.
const TERRAIN_SOURCE = 'selection-dem';
const SUN_SHADOW_SOURCE = 'sun-shadows';
const SUN_BUILDING_SOURCE = 'sun-buildings';
const SUN_CANOPY_SOURCE = 'sun-canopies';
const SUN_BUILDING_COLOR = '#c7ccda';
const SUN_CANOPY_COLOR = '#5c8a4a';
const SUN_RADIUS_M = 250;

// --- Outils de mesure (US-1.5 + v2) -------------------------------------------------------------
// Distance (polyligne), surface (polygone), dénivelé (2 points, RGE ALTI) et recul (point -> contour
// de parcelle). Cœur de calcul PUR dans lib/geo/measure.ts (testé) ; ici le rendu carte, l'interaction,
// les ÉTIQUETTES VIVANTES sur l'axe (v2, ruban élastique) et le CUMUL de plusieurs mesures sur le plan.
// Couleur teal distincte de l'ambre (sélection) et de l'indigo (recherche par surface).
const MEASURE_SOURCE = 'measure';
const MEASURE_COLOR = '#0E7490';

type MeasureTool = 'distance' | 'surface' | 'denivele' | 'recul';

/** Résultat figé d'un dénivelé (altitudes RGE ALTI). */
interface DeniveleResult {
  zA: number;
  zB: number;
  deltaZ: number;
  slopePct: number | null;
  horizM: number;
}
/** Résultat figé d'un recul (point cliqué -> contour le plus proche). */
interface ReculResult {
  point: LngLat;
  nearestPoint: LngLat;
  distanceM: number;
}

/** Une mesure FIGÉE, cumulée sur le plan (v2 : plusieurs mesures coexistent). */
interface Measurement {
  id: number;
  tool: MeasureTool;
  points: LngLat[];
  denivele?: DeniveleResult;
  recul?: ReculResult;
}

/** État de la mesure de dénivelé EN COURS (RGE ALTI asynchrone ; hors couverture = indisponible,
 *  règle 3). Le succès n'est PAS un état ici : il devient directement une mesure figée (Δ sur l'axe). */
type DeniveleState =
  | { state: 'partial' }
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'unavailable' };

// Feature GeoJSON minimal de la source de mesure. `t` distingue sommet (cercle) et étiquette (texte).
// Le brouillon vivant est poussé EN DERNIER dans la source (buildMeasureFC), donc dessiné au-dessus des
// mesures figées (symbol-z-order: 'source' sur le calque d'étiquettes) : pas besoin de clé de tri.
type MeasureFeature = {
  type: 'Feature';
  properties: { t?: 'vertex' | 'label'; label?: string };
  geometry: unknown;
};

const vertexFeat = (p: LngLat): MeasureFeature => ({ type: 'Feature', properties: { t: 'vertex' }, geometry: { type: 'Point', coordinates: p } });
const labelFeat = (p: LngLat, label: string): MeasureFeature => ({ type: 'Feature', properties: { t: 'label', label }, geometry: { type: 'Point', coordinates: p } });
const lineFeat = (pts: LngLat[]): MeasureFeature => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });

/** Ferme un anneau de sommets pour le rendu du polygone de mesure de surface. */
function closeMeasureRing(pts: LngLat[]): LngLat[] {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) return [...pts, first];
  return pts;
}

/** Étiquettes de longueur au milieu de chaque segment (distance affichée SUR l'axe). */
function segmentLabels(pts: LngLat[]): MeasureFeature[] {
  const out: MeasureFeature[] = [];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    out.push(labelFeat(segmentMidpoint(a, b), formatMeters(lineLengthMeters([a, b]))));
  }
  return out;
}

/** Features d'une polyligne (distance) : ligne + sommets + étiquettes de segment. */
function polylineFeatures(pts: LngLat[]): MeasureFeature[] {
  const out: MeasureFeature[] = [];
  if (pts.length >= 2) out.push(lineFeat(pts));
  for (const p of pts) out.push(vertexFeat(p));
  out.push(...segmentLabels(pts));
  return out;
}

/** Features d'une surface : polygone fermé + sommets + aire au centroïde (ou « tracé invalide »). */
function surfaceFeatures(pts: LngLat[]): MeasureFeature[] {
  const out: MeasureFeature[] = [];
  if (pts.length >= 3) {
    out.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [closeMeasureRing(pts)] } });
    const c = ringCentroid(pts);
    if (c) out.push(labelFeat(c, isSelfIntersectingRing(pts) ? 'tracé invalide' : formatSquareMeters(polygonAreaMeters(pts))));
  } else if (pts.length >= 2) {
    out.push(lineFeat(pts));
  }
  for (const p of pts) out.push(vertexFeat(p));
  return out;
}

/** Ligne A-B + sommets pour le dénivelé (SANS étiquette de distance : le dénivelé mesure un Δ, pas la
 *  distance horizontale ; le Δ n'existe qu'à la finalisation, cf. measurementFeatures). */
function deniveleLineFeatures(pts: LngLat[]): MeasureFeature[] {
  const out: MeasureFeature[] = [];
  if (pts.length >= 2) out.push(lineFeat(pts));
  for (const p of pts) out.push(vertexFeat(p));
  return out;
}

/** Features d'une mesure FIGÉE selon son type (étiquette = valeur figée, priorité normale). */
function measurementFeatures(m: Measurement): MeasureFeature[] {
  if (m.tool === 'distance') return polylineFeatures(m.points);
  if (m.tool === 'surface') return surfaceFeatures(m.points);
  if (m.tool === 'denivele') {
    const out = deniveleLineFeatures(m.points);
    if (m.denivele && m.points.length >= 2) {
      const d = m.denivele;
      const label = `Δ ${formatSignedMeters(d.deltaZ)}${d.slopePct != null ? ` · ${formatPercent(d.slopePct)}` : ''}`;
      out.push(labelFeat(segmentMidpoint(m.points[0]!, m.points[1]!), label));
    }
    return out;
  }
  if (m.recul) {
    const seg: LngLat[] = [m.recul.point, m.recul.nearestPoint];
    return [lineFeat(seg), vertexFeat(m.recul.point), vertexFeat(m.recul.nearestPoint), labelFeat(segmentMidpoint(seg[0]!, seg[1]!), formatMeters(m.recul.distanceM))];
  }
  return [];
}

/** Features du BROUILLON en cours (dessiné au-dessus des figées, il est poussé en dernier dans la
 *  source). Ruban élastique jusqu'au curseur pour distance/surface ; pour le dénivelé, ruban A->curseur
 *  SEULEMENT tant qu'on place le 2e point, et sans étiquette de distance (le Δ n'apparaît qu'à la
 *  finalisation, jamais un chiffre trompeur). */
function draftFeatures(tool: MeasureTool | null, draft: LngLat[], hover: LngLat | null): MeasureFeature[] {
  if (!tool || draft.length === 0) return [];
  if (tool === 'recul') return draft.map(vertexFeat); // finalisé au clic, pas de brouillon persistant
  if (tool === 'denivele') {
    const pts = hover != null && draft.length < 2 ? [...draft, hover] : draft;
    return deniveleLineFeatures(pts);
  }
  const pts = hover != null ? [...draft, hover] : draft;
  if (tool === 'surface') return surfaceFeatures(pts);
  return polylineFeatures(pts);
}

/** FeatureCollection complète : toutes les mesures figées + le brouillon en cours. */
function buildMeasureFC(measurements: Measurement[], tool: MeasureTool | null, draft: LngLat[], hover: LngLat | null) {
  const features: MeasureFeature[] = [];
  for (const m of measurements) features.push(...measurementFeatures(m));
  features.push(...draftFeatures(tool, draft, hover));
  return { type: 'FeatureCollection' as const, features };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * (Ré)active le relief 3D (MNT Terrarium) sur le style courant. Idempotent ; à rappeler après chaque
 * chargement de style (setStyle remet le terrain à zéro). Le relief n'est visible qu'en vue inclinée ;
 * à plat (pitch 0) la carte reste lisible en 2D. Exagération 1,2x (rendu, pas une mesure).
 */
function ensureTerrain(map: MaplibreMap): void {
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

const presetChip: CSSProperties = {
  border: 'none',
  borderRadius: '7px',
  padding: '4px 9px',
  fontFamily: SANS,
  fontSize: '11.5px',
  fontWeight: 600,
  cursor: 'pointer',
};

// Lignes du panneau de mesure (résultat principal en mono, détails en gris).
const measureReadoutMain: CSSProperties = { margin: 0, fontSize: '13px', color: TEXT, fontFamily: MONO };
const measureReadoutSub: CSSProperties = { margin: 0, fontSize: '12px', color: SUB };
const measureMethod: CSSProperties = { margin: 0, fontSize: '11px', color: MICRO };

const MEASURE_TOOL_LABELS: Array<{ id: MeasureTool; label: string }> = [
  { id: 'distance', label: 'Distance' },
  { id: 'surface', label: 'Surface' },
  { id: 'denivele', label: 'Dénivelé' },
  { id: 'recul', label: 'Recul' },
];

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

  // Relief chargé en permanence (les deux fonds) : rejoué ici car setStyle remet le terrain à zéro.
  ensureTerrain(map);
  // Surcouche cadastre UNIQUE (PCI, paliers) sur les deux fonds : seul l'image de fond change en satellite.
  ensureCadastreOverlay(map);

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

  // Calques de mesure (US-1.5), tout en haut de la pile applicative : les tracés de mesure restent
  // visibles au-dessus du cadastre et de la sélection. Les données sont (re)posées par un effet dédié.
  installMeasureLayers(map);
}

/**
 * Installe (idempotent) la source et les calques des outils de mesure sur le style courant : remplissage
 * (polygone de surface), ligne (distance/dénivelé/recul, tirets) et sommets (cercles). À rappeler après
 * chaque chargement de style (via installOverlays), sinon ils disparaissent à la bascule de fond.
 */
function installMeasureLayers(map: MaplibreMap): void {
  if (!map.getSource(MEASURE_SOURCE)) {
    map.addSource(MEASURE_SOURCE, { type: 'geojson', data: EMPTY_FC as SetDataArg });
  }
  if (!map.getLayer('measure-fill')) {
    map.addLayer({
      id: 'measure-fill',
      type: 'fill',
      source: MEASURE_SOURCE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': MEASURE_COLOR, 'fill-opacity': 0.15 },
    });
  }
  if (!map.getLayer('measure-line')) {
    map.addLayer({
      id: 'measure-line',
      type: 'line',
      source: MEASURE_SOURCE,
      filter: ['!=', ['geometry-type'], 'Point'],
      paint: { 'line-color': MEASURE_COLOR, 'line-width': 2.5, 'line-dasharray': [2, 1.2] },
    });
  }
  if (!map.getLayer('measure-points')) {
    map.addLayer({
      id: 'measure-points',
      type: 'circle',
      source: MEASURE_SOURCE,
      filter: ['==', ['get', 't'], 'vertex'],
      paint: {
        'circle-radius': 4.5,
        'circle-color': '#FFFFFF',
        'circle-stroke-color': MEASURE_COLOR,
        'circle-stroke-width': 2,
      },
    });
  }
  // Étiquettes de mesure SUR l'axe (v2). Police servie par les glyphs IGN sur les deux fonds (comme
  // les libellés du cadastre) ; halo blanc pour rester lisible.
  // IMPORTANT : `text-allow-overlap` + `text-ignore-placement` = rendu IMMÉDIAT sans collision. Sans
  // cela, chaque `setData` du ruban élastique (~60 fps) relance le placement des symboles, qui fondent
  // en sortie/entrée : les étiquettes CLIGNOTENT (disparaissent/réapparaissent à chaque mouvement de
  // souris). En contournant le placement, l'étiquette est toujours dessinée, stable. Le brouillon,
  // poussé en dernier dans la source, se dessine au-dessus (symbol-z-order: source), donc lisible aussi
  // sur le bâti 3D de l'ensoleillement.
  if (!map.getLayer('measure-labels')) {
    map.addLayer({
      id: 'measure-labels',
      type: 'symbol',
      source: MEASURE_SOURCE,
      filter: ['==', ['get', 't'], 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Source Sans Pro Regular'],
        'text-size': 12,
        'text-offset': [0, -0.7],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'symbol-z-order': 'source',
      },
      paint: {
        'text-color': '#0B4A57',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1.6,
      },
    });
  }
}

/** Remonte les calques de mesure au-dessus des autres (ex. après (ré)installation des calques soleil,
 *  pour que le tracé et surtout les ÉTIQUETTES restent lisibles par-dessus le bâti 3D). Idempotent. */
function raiseMeasureLayers(map: MaplibreMap): void {
  for (const id of ['measure-fill', 'measure-line', 'measure-points', 'measure-labels']) {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        // calque transitoirement absent : sans effet.
      }
    }
  }
}

/**
 * Installe (idempotent) les calques de l'analyse d'ensoleillement sur le style courant : ombres au
 * sol (fill), canopée végétale extrudée (volume approximé) et bâtiments extrudés (hauteur BD TOPO ;
 * sans hauteur => 0, non extrudé, règle 3). Tout est natif MapLibre. Choix d'empilement assumé :
 * l'ombre est posée SOUS le CONTOUR de la sélection (liseré sombre + trait ambre, qui restent nets
 * au-dessus), mais AU-DESSUS du fond ambre, pour qu'on VOIE l'ombre d'un bâtiment voisin tomber sur
 * la parcelle sélectionnée, ce qui est l'intérêt même d'une étude d'ensoleillement.
 */
function installSunLayers(map: MaplibreMap): void {
  for (const id of [SUN_SHADOW_SOURCE, SUN_BUILDING_SOURCE, SUN_CANOPY_SOURCE]) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FC as SetDataArg });
  }
  // Ombrage du relief piloté par le soleil (hillshade natif sur le MNT), tout en bas de la pile
  // applicative (sous les résultats/sélection), pour que le relief cesse d'être plat face au soleil.
  // Ce n'est pas une ombre projetée à distance : les versants à contre-jour s'assombrissent, la
  // direction et l'intensité suivent l'heure et la saison (mis à jour dans l'effet). Rendu, pas de la donnée.
  if (!map.getLayer('sun-hillshade')) {
    // Sous la surcouche cadastre et les résultats/sélection : l'ombrage du relief ne masque pas le cadastre.
    const under = ['pci-departement', 'pci-commune', 'pci-parcelle', 'surface-fill'].find((id) => map.getLayer(id));
    map.addLayer(
      {
        id: 'sun-hillshade',
        type: 'hillshade',
        source: TERRAIN_SOURCE,
        paint: {
          'hillshade-illumination-anchor': 'map',
          'hillshade-illumination-direction': 315,
          'hillshade-exaggeration': 0.5,
          'hillshade-shadow-color': '#2a2f45',
          'hillshade-highlight-color': '#fff3df',
        },
      },
      under,
    );
  }
  if (!map.getLayer('sun-shadow-fill')) {
    // Sous le liseré de contour (selection-casing), donc au-dessus du fond ambre : ombre visible sur la parcelle.
    const beforeId = map.getLayer('selection-casing') ? 'selection-casing' : undefined;
    map.addLayer(
      {
        id: 'sun-shadow-fill',
        type: 'fill',
        source: SUN_SHADOW_SOURCE,
        paint: { 'fill-color': '#1a2036', 'fill-opacity': 0.28 },
      },
      beforeId,
    );
  }
  if (!map.getLayer('sun-canopy-3d')) {
    map.addLayer({
      id: 'sun-canopy-3d',
      type: 'fill-extrusion',
      source: SUN_CANOPY_SOURCE,
      paint: {
        'fill-extrusion-color': SUN_CANOPY_COLOR,
        'fill-extrusion-height': ['coalesce', ['get', 'hauteur'], 0],
        'fill-extrusion-opacity': 0.6,
      },
    });
  }
  if (!map.getLayer('sun-buildings-3d')) {
    map.addLayer({
      id: 'sun-buildings-3d',
      type: 'fill-extrusion',
      source: SUN_BUILDING_SOURCE,
      paint: {
        'fill-extrusion-color': SUN_BUILDING_COLOR,
        'fill-extrusion-height': ['coalesce', ['get', 'hauteur'], 0],
        'fill-extrusion-opacity': 0.92,
      },
    });
  }
}

/** Retire les calques et sources de l'analyse d'ensoleillement (retour à la vue 2D). */
function removeSunLayers(map: MaplibreMap): void {
  for (const id of ['sun-buildings-3d', 'sun-canopy-3d', 'sun-shadow-fill', 'sun-hillshade']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [SUN_SHADOW_SOURCE, SUN_BUILDING_SOURCE, SUN_CANOPY_SOURCE]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/**
 * (Ré)injecte les volumes extrudés (bâti + canopée) et les ombres au sol de l'instant courant dans
 * les sources d'analyse. Réutilisé à la fin du chargement initial ET après une bascule de fond de
 * carte (le style est remis à zéro : on repeuple depuis les données déjà en mémoire, sans re-fetch).
 */
function populateSunSources(
  map: MaplibreMap,
  data: { buildings: SunVolume[]; canopies: SunVolume[] },
  centroid: { lon: number; lat: number },
  dateStr: string,
  minutes: number,
  onSansHauteur: (n: number) => void,
): void {
  (map.getSource(SUN_BUILDING_SOURCE) as GeoJSONSource | undefined)?.setData(
    toExtrusionFC(data.buildings) as SetDataArg,
  );
  (map.getSource(SUN_CANOPY_SOURCE) as GeoJSONSource | undefined)?.setData(
    toExtrusionFC(data.canopies) as SetDataArg,
  );
  const pos = sunPosition(new Date(timestampFor(dateStr, minutes)), centroid.lat, centroid.lon);
  const { shadows, sansHauteur } = sunShadowsFor(data.buildings, data.canopies, pos);
  onSansHauteur(sansHauteur);
  (map.getSource(SUN_SHADOW_SOURCE) as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: shadows,
  } as SetDataArg);
}

/**
 * Carte de sélection de parcelles (US-1.1 / US-1.2 / US-1.6). Fond de carte au choix
 * (plan vectoriel Veriterra ou satellite IGN, cadastre en calque), recherche d'adresse
 * (BAN) avec autocomplétion, sélection de parcelles au clic (API Carto Cadastre) surlignées
 * en ambre, et recherche par surface approchée dans la zone visible (parcelles proches
 * surlignées en indigo, cliquables pour les ajouter). Composant client, robuste au SSR :
 * la carte MapLibre n'est créée que dans un effet, côté navigateur.
 */
export function SelectionMap({
  onSelectionChange,
  onAddressPick,
  initialSelection,
  readOnly = false,
  onExpand,
}: SelectionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [selection, setSelection] = useState<SelectedParcelle[]>(initialSelection ?? []);
  const [matches, setMatches] = useState<ParcelleInZone[]>([]);
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);

  // Miroirs pour réinjecter les données après un rechargement de style (closures fraîches).
  const selectionRef = useRef(selection);
  const matchesRef = useRef(matches);
  const basemapRef = useRef(basemap);
  // Mode focalisé (fiche) : le clic sur la carte n'édite pas la sélection.
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  // Emprise à cadrer à l'ouverture (parcelles préchargées), une seule fois.
  const focusDoneRef = useRef(false);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [surfaceTarget, setSurfaceTarget] = useState('');
  const [surfaceTolerance, setSurfaceTolerance] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const [clickLoading, setClickLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Outils de mesure (US-1.5 + v2) : outil actif, brouillon en cours (sommets cliqués), mesures FIGÉES
  // cumulées sur le plan, et état du dénivelé en cours (asynchrone via RGE ALTI).
  const [measureTool, setMeasureTool] = useState<MeasureTool | null>(null);
  const [draftPoints, setDraftPoints] = useState<LngLat[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [denivele, setDenivele] = useState<DeniveleState | null>(null);
  // Miroirs lus par les handlers de la carte (montés une seule fois, closures figées) et le rendu
  // impératif du tracé (mousemove -> requestAnimationFrame, sans re-render React à chaque pixel).
  const measureToolRef = useRef(measureTool);
  measureToolRef.current = measureTool;
  const draftPointsRef = useRef(draftPoints);
  draftPointsRef.current = draftPoints;
  const measurementsRef = useRef(measurements);
  measurementsRef.current = measurements;
  const measureHoverRef = useRef<LngLat | null>(null);
  const measureFrameRef = useRef<number | null>(null);
  const measureIdRef = useRef(0);

  // Analyse d'ensoleillement EN PLACE : bascule 3D + relief natif + bâti/canopée extrudés + ombres Turf.
  const [sunActive, setSunActive] = useState(false);
  // Petit écran : sans adaptation, la recherche (haut-gauche) et les sliders d'ensoleillement (bas-gauche)
  // couvrent quasi tout le téléphone et rendent l'analyse inutilisable (retour porteur). On masque la
  // recherche pendant l'analyse et on rend le panneau d'ensoleillement repliable.
  const [isNarrow, setIsNarrow] = useState(false);
  // Sur petit écran, le panneau d'ensoleillement est REPLIÉ par défaut (heure seule) pour laisser voir
  // la carte ; l'utilisateur déplie pour la saison et les détails. Sans effet sur grand écran.
  const [sunPanelCollapsed, setSunPanelCollapsed] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const [sunMinutes, setSunMinutes] = useState(14 * 60);
  const [sunDate, setSunDate] = useState<string>(todayStr);
  const [sunLoading, setSunLoading] = useState(false);
  const [sunError, setSunError] = useState<string | null>(null);
  const [sunCounts, setSunCounts] = useState<{ b: number; v: number }>({ b: 0, v: 0 });
  const [sunUnavail, setSunUnavail] = useState<{ b: boolean; v: boolean }>({ b: false, v: false });
  // Bâtiments sans hauteur BD TOPO : exclus des ombres et affichés honnêtement (règle 3).
  const [sunSansHauteur, setSunSansHauteur] = useState(0);
  const sunDataRef = useRef<{ buildings: SunVolume[]; canopies: SunVolume[] } | null>(null);
  // Clé du centroïde effectivement CHARGÉ : distingue un simple rechargement de style (bascule de
  // fond, même centroïde => on repeuple sans re-fetch ni re-cadrage) d'un changement de sélection
  // (nouveau centroïde => on recharge et on recadre).
  const sunFetchedKeyRef = useRef<string>('');
  // Clé du centroïde déjà CADRÉ (caméra positionnée pour l'analyse) : évite de re-cadrer (easeTo) sur un
  // simple rechargement de style survenu PENDANT le chargement initial (le fetch en vol est annulé, donc
  // `sunDataRef` reste null et sans ce garde on retomberait dans la branche d'entrée, écrasant la caméra).
  const sunFramedKeyRef = useRef<string>('');
  // Vrai tant qu'on est EN analyse : sert à ne remettre la carte à plat qu'en SORTIE d'analyse, pas
  // sur un rechargement de style (bascule de fond), qui écraserait sinon l'angle 3D de l'utilisateur.
  const wasSunActiveRef = useRef(false);
  // Miroirs de l'instant courant : la mise à jour d'après-chargement applique l'heure/saison
  // RÉELLES même si l'utilisateur a bougé un curseur pendant le fetch initial (closures fraîches).
  const sunDateRef = useRef(sunDate);
  sunDateRef.current = sunDate;
  const sunMinutesRef = useRef(sunMinutes);
  sunMinutesRef.current = sunMinutes;

  // Mémoïse le centroïde sur sa VALEUR (lon/lat) : ajouter une parcelle (même première parcelle)
  // ne change pas le centroïde effectif et ne doit donc pas relancer l'analyse.
  const centroidRaw = parcellesCentroid(selection);
  const centroidKey = centroidRaw ? `${centroidRaw.lon.toFixed(6)},${centroidRaw.lat.toFixed(6)}` : '';
  const sunCentroid = useMemo(() => centroidRaw, [centroidKey]);
  const sunPos = useMemo(
    () =>
      sunCentroid
        ? sunPosition(new Date(timestampFor(sunDate, sunMinutes)), sunCentroid.lat, sunCentroid.lon)
        : null,
    [sunCentroid, sunDate, sunMinutes],
  );
  // Voile d'ambiance jour/nuit (réchauffe le jour/crépuscule, assombrit la nuit) : rendu, pas de la
  // donnée (règles 1 et 3). Actif seulement pendant l'analyse.
  const sunAmbience = useMemo(
    () => (sunActive && sunPos ? ambienceForAltitude(sunPos.altitudeDeg) : null),
    [sunActive, sunPos],
  );
  // Repères d'extrêmes (solstices/équinoxes) de l'année courante, pour sauter aux cas limites.
  const sunPresets = useMemo(() => {
    const year = Number(sunDate.slice(0, 4)) || new Date().getFullYear();
    const marks = seasonMarks(year);
    return [
      { label: 'Printemps', date: marks.printemps },
      { label: 'Été', date: marks.ete },
      { label: 'Automne', date: marks.automne },
      { label: 'Hiver', date: marks.hiver },
    ];
  }, [sunDate]);
  // Remise à l'instant courant (aujourd'hui, 14:00).
  const resetSun = useCallback(() => {
    setSunDate(todayStr());
    setSunMinutes(14 * 60);
  }, []);

  // Entrée/sortie du mode : pitch 3D + relief natif + calques bâti/canopée/ombres + chargement des données.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!sunActive || !sunCentroid) {
      removeSunLayers(map);
      sunDataRef.current = null;
      sunFetchedKeyRef.current = '';
      sunFramedKeyRef.current = '';
      // Le relief reste en place (permanent) : on réinitialise le ciel.
      try {
        map.setSky({}); // réinitialise le ciel (retour en 2D).
      } catch {
        // pas de ciel : rien à faire.
      }
      // On remet À PLAT seulement en SORTIE d'analyse (transition analyse -> plus d'analyse), PAS sur un
      // simple rechargement de style (bascule de fond : cet effet re-tourne via `mapReady` alors qu'on
      // n'était déjà plus en analyse). Sinon la bascule Plan/Satellite écraserait l'angle 3D de l'utilisateur.
      if (wasSunActiveRef.current) {
        map.easeTo({ pitch: 0, bearing: 0 });
      }
      wasSunActiveRef.current = false;
      // La sélection a été vidée pendant l'analyse : on referme le panneau (pas de demi-état).
      if (sunActive && !sunCentroid) setSunActive(false);
      return;
    }
    wasSunActiveRef.current = true;

    // Le relief est déjà chargé (permanent) ; on (ré)ajoute les calques bâti/canopée/ombres/hillshade.
    // Idempotent : rejoué aussi après une bascule de fond de carte (setStyle a remis le style à zéro,
    // cet effet re-tourne via `mapReady`).
    installSunLayers(map);
    // Mesure et ensoleillement coexistent (retour porteur) : on remonte les calques de mesure AU-DESSUS
    // des extrusions pour que le tracé et surtout les étiquettes restent lisibles sur le bâti 3D.
    raiseMeasureLayers(map);

    // Rechargement de style à centroïde INCHANGÉ (bascule Plan/Satellite) : on repeuple depuis les
    // données déjà chargées, SANS re-fetch ni re-cadrage caméra (l'utilisateur garde sa vue 3D).
    const cached = sunDataRef.current;
    if (cached && sunFetchedKeyRef.current === centroidKey) {
      populateSunSources(map, cached, sunCentroid, sunDateRef.current, sunMinutesRef.current, setSunSansHauteur);
      return;
    }

    // Entrée dans l'analyse (ou changement de sélection) : on cadre la vue 3D. On NE re-cadre PAS si ce
    // centroïde a déjà été cadré (cas d'un rechargement de style pendant le chargement initial : le
    // `jumpTo` de switchBasemap a déjà restauré la caméra de l'utilisateur, ne pas l'écraser).
    if (sunFramedKeyRef.current !== centroidKey) {
      map.easeTo({
        center: [sunCentroid.lon, sunCentroid.lat],
        zoom: Math.max(map.getZoom(), 16.5),
        pitch: 55,
        bearing: -20,
      });
      sunFramedKeyRef.current = centroidKey;
    }

    let cancelled = false;
    setSunLoading(true);
    setSunError(null);
    setSunUnavail({ b: false, v: false });
    const q = `lon=${sunCentroid.lon}&lat=${sunCentroid.lat}&radius=${SUN_RADIUS_M}`;
    void (async () => {
      try {
        const [bResp, vResp] = await Promise.all([fetch(`/api/buildings?${q}`), fetch(`/api/vegetation?${q}`)]);
        if (cancelled) return;
        // Un statut non-ok (429 débit, 502 source injoignable) est une INDISPONIBILITÉ, pas un
        // « 0 » : on l'affiche comme telle (règle 3), sans effacer le signal de panne côté serveur.
        const bOk = bResp.ok;
        const vOk = vResp.ok;
        const bJson = bOk ? await bResp.json() : { batiments: [] };
        const vJson = vOk ? await vResp.json() : { canopees: [] };
        if (cancelled) return;
        const buildings: SunVolume[] = (Array.isArray(bJson.batiments) ? bJson.batiments : []).map(
          (b: { geometry: SunVolume['geometry']; hauteur: number | null }) => ({ geometry: b.geometry, hauteur: b.hauteur ?? null }),
        );
        const canopies: SunVolume[] = (Array.isArray(vJson.canopees) ? vJson.canopees : []).map(
          (c: { geometry: SunVolume['geometry']; hauteur: number | null }) => ({ geometry: c.geometry, hauteur: c.hauteur ?? null }),
        );
        sunDataRef.current = { buildings, canopies };
        sunFetchedKeyRef.current = centroidKey;
        setSunCounts({ b: buildings.length, v: canopies.length });
        setSunUnavail({ b: !bOk, v: !vOk });
        // Volumes extrudés (natif MapLibre) + ombres à l'instant COURANT (via refs : correct même
        // si un curseur a bougé pendant le fetch).
        populateSunSources(
          map,
          { buildings, canopies },
          sunCentroid,
          sunDateRef.current,
          sunMinutesRef.current,
          setSunSansHauteur,
        );
      } catch {
        if (!cancelled) setSunError('Données 3D indisponibles (bâtiments ou végétation).');
      } finally {
        if (!cancelled) setSunLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // sunDate/sunMinutes exclus volontairement : l'instant initial suffit ici, l'effet suivant met à jour.
  }, [sunActive, sunCentroid, centroidKey, mapReady]);

  // Mise à jour de l'instant (heure + saison) : recalcule les ombres (Turf) et l'ambiance jour/nuit
  // (ciel, teinte des façades et des ombres), sans recharger les données.
  //
  // Coalescé sur une FRAME d'animation : le curseur d'heure émet des `onChange` en rafale pendant le
  // glissement, et le recalcul des ombres de canopée (union booléenne par emprise boisée) est lourd.
  // On ne garde qu'un recalcul par frame (le plus récent), la rafale d'événements ne compte plus.
  useEffect(() => {
    if (!sunActive) return;
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const data = sunDataRef.current;
      if (data && sunPos) {
        const { shadows } = sunShadowsFor(data.buildings, data.canopies, sunPos);
        (map.getSource(SUN_SHADOW_SOURCE) as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: shadows,
        } as SetDataArg);
      }
      if (sunPos) {
        const amb = ambienceForAltitude(sunPos.altitudeDeg);
        const azimuth = Math.round((((sunPos.azimuthDeg % 360) + 360) % 360));
        try {
          map.setSky(amb.sky);
          if (map.getLayer('sun-buildings-3d')) {
            map.setPaintProperty('sun-buildings-3d', 'fill-extrusion-color', amb.buildingColor);
          }
          if (map.getLayer('sun-shadow-fill')) {
            map.setPaintProperty('sun-shadow-fill', 'fill-color', amb.shadowColor);
            // Opacité en FONDU : NULLE sous l'horizon (l'ombre disparaît complètement la nuit), puis
            // elle réapparaît au lever et se densifie quand le soleil monte (l'intensité suit sa course).
            map.setPaintProperty('sun-shadow-fill', 'fill-opacity', shadowFadeOpacity(sunPos.altitudeDeg));
          }
          if (map.getLayer('sun-hillshade')) {
            // Le relief s'ombre dans la direction du soleil (azimut), plus marqué quand il est bas.
            map.setPaintProperty('sun-hillshade', 'hillshade-illumination-direction', azimuth);
            map.setPaintProperty('sun-hillshade', 'hillshade-exaggeration', hillshadeExaggeration(sunPos.altitudeDeg));
          }
        } catch {
          // style transitoirement indisponible : rien de bloquant.
        }
      }
    };

    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
    // `mapReady` : réapplique la peinture des ombres/relief après un rechargement de style (bascule
    // de fond de carte), sinon `sun-shadow-fill` resterait à son opacité par défaut jusqu'au prochain
    // pas de curseur.
  }, [sunActive, sunDate, sunMinutes, sunPos, mapReady]);

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
    // Compas + visualisation du pitch : permet d'incliner la carte pour voir le relief (permanent).
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');

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

    // Rendu impératif du tracé de mesure (lit les refs) : appelé par l'effet d'état ET par le mousemove
    // (via requestAnimationFrame) pour le ruban élastique, sans re-render React à chaque pixel.
    const renderMeasureNow = () => {
      (map.getSource(MEASURE_SOURCE) as GeoJSONSource | undefined)?.setData(
        buildMeasureFC(measurementsRef.current, measureToolRef.current, draftPointsRef.current, measureHoverRef.current) as SetDataArg,
      );
    };

    // Clic en mode mesure : distance/surface ajoutent un sommet au brouillon ; dénivelé accumule 2 points
    // (un 3e recommence) ; recul FIGE immédiatement une mesure (distance point -> contour de la parcelle
    // sélectionnée). Les mesures terminées se cumulent sur le plan (v2).
    const handleMeasureClick = (lngLat: LngLat) => {
      const tool = measureToolRef.current;
      if (!tool) return;
      if (tool === 'recul') {
        let best: ReculResult | null = null;
        for (const p of selectionRef.current) {
          const nb = nearestBoundaryDistance(lngLat, p.geojson);
          if (nb && (best === null || nb.distanceM < best.distanceM)) {
            best = { point: lngLat, nearestPoint: nb.nearestPoint, distanceM: nb.distanceM };
          }
        }
        if (best) {
          const rec = best;
          const id = (measureIdRef.current += 1);
          setMeasurements((prev) => [...prev, { id, tool: 'recul', points: [rec.point], recul: rec }]);
        }
        return;
      }
      if (tool === 'denivele') {
        setDraftPoints((prev) => (prev.length >= 2 ? [lngLat] : [...prev, lngLat]));
        return;
      }
      setDraftPoints((prev) => [...prev, lngLat]);
    };

    map.on('click', (e) => {
      // Mode mesure prioritaire (avant le garde lecture seule) : la mesure marche aussi dans la fiche.
      const tool = measureToolRef.current;
      if (tool) {
        // Recul sans sélection : on laisse le clic SÉLECTIONNER d'abord une parcelle (sinon on ne
        // pourrait plus en cliquer une en mode mesure). Les clics suivants mesureront le recul.
        const needsParcelFirst = tool === 'recul' && selectionRef.current.length === 0;
        if (!needsParcelFirst) {
          handleMeasureClick([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
      }
      // Mode focalisé (fiche) : la sélection est fixe, le clic n'édite pas.
      if (readOnlyRef.current) return;
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

    // Ruban élastique : le curseur devient le dernier sommet PROVISOIRE du brouillon. On ne repeint que
    // si un ruban est réellement possible (distance/surface/dénivelé AVEC au moins un sommet posé) :
    // sinon (recul, ou aucun point cliqué) le survol ne change rien au rendu, inutile de reposer la
    // source. Coalescé sur une frame (le mousemove émet en rafale ; un seul repeint par frame).
    map.on('mousemove', (e) => {
      const tool = measureToolRef.current;
      if (!tool || tool === 'recul' || draftPointsRef.current.length === 0) return;
      measureHoverRef.current = [e.lngLat.lng, e.lngLat.lat];
      if (measureFrameRef.current != null) return;
      measureFrameRef.current = requestAnimationFrame(() => {
        measureFrameRef.current = null;
        renderMeasureNow();
      });
    });
    // Le curseur quitte la carte : plus de ruban élastique.
    map.on('mouseout', () => {
      if (measureHoverRef.current == null) return;
      measureHoverRef.current = null;
      renderMeasureNow();
    });

    // Double-clic : FIGE la mesure de distance/surface en cours (zoom du double-clic désactivé par un
    // effet dédié). Retire TOUJOURS le sommet dupliqué des deux clics du double-clic (la souris dérive de
    // 1 à 3 px, ce qui fausserait sinon la longueur/surface avec un segment parasite, règle 1).
    map.on('dblclick', (e) => {
      const tool = measureToolRef.current;
      if (tool !== 'distance' && tool !== 'surface') return;
      e.preventDefault();
      const pts = draftPointsRef.current;
      const deduped = pts.length >= 2 ? pts.slice(0, -1) : pts;
      const min = tool === 'surface' ? 3 : 2;
      if (deduped.length >= min) {
        const id = (measureIdRef.current += 1);
        setMeasurements((prev) => [...prev, { id, tool, points: deduped }]);
        setDraftPoints([]);
      } else {
        setDraftPoints(deduped);
      }
    });

    return () => {
      if (measureFrameRef.current != null) cancelAnimationFrame(measureFrameRef.current);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Synchronise le surlignage de sélection (ambre) et remonte la sélection au parent (si demandé).
  useEffect(() => {
    selectionRef.current = selection;
    const map = mapRef.current;
    if (map && mapReady) {
      (map.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined)?.setData(
        toFeatureCollection(selection) as SetDataArg,
      );
    }
    onSelectionChange?.(selection);
  }, [selection, mapReady, onSelectionChange]);

  // Cadre la vue sur la sélection initiale (fiche/focus terrain) à l'ouverture, une seule fois.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || focusDoneRef.current) return;
    const init = initialSelection ?? [];
    if (init.length === 0) return;
    const bounds = boundsOfGeometries(init.map((p) => p.geojson));
    if (!bounds) return;
    focusDoneRef.current = true;
    map.fitBounds(bounds, { padding: 64, duration: 800, maxZoom: 17.5 });
  }, [mapReady, initialSelection]);

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

  // --- Outils de mesure (US-1.5 + v2) : effets de rendu et de calcul ------------------------------

  // Rendu du tracé (mesures figées + brouillon) : (re)pose la FeatureCollection dans la source. Le
  // ruban élastique (hover) est peint impérativement par le mousemove ; cet effet couvre les
  // changements d'état (clic, finalisation) et le rechargement de style (`mapReady`, bascule de fond).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource(MEASURE_SOURCE) as GeoJSONSource | undefined)?.setData(
      buildMeasureFC(measurements, measureTool, draftPoints, measureHoverRef.current) as SetDataArg,
    );
  }, [measurements, draftPoints, measureTool, mapReady]);

  // Efface le curseur mémorisé quand le brouillon est vidé (finalisation / effacement) : un nouveau
  // tracé ne doit pas partir d'un ruban élastique périmé (ancienne position du curseur) avant le
  // premier mousemove.
  useEffect(() => {
    if (draftPoints.length === 0) measureHoverRef.current = null;
  }, [draftPoints]);

  // Dénivelé : altitudes des deux points via RGE ALTI (asynchrone). Au succès, la mesure est FIGÉE
  // (poussée dans `measurements`, Δ affiché sur l'axe) et le brouillon vidé pour enchaîner. Hors
  // couverture (null) => « indisponible » (règle 3, jamais un 0) ; source injoignable => « erreur »
  // (le brouillon reste pour voir les 2 points et réessayer).
  useEffect(() => {
    if (measureTool !== 'denivele') {
      setDenivele(null);
      return;
    }
    if (draftPoints.length === 0) {
      setDenivele(null);
      return;
    }
    if (draftPoints.length === 1) {
      setDenivele({ state: 'partial' });
      return;
    }
    const a = draftPoints[0]!;
    const b = draftPoints[1]!;
    let cancelled = false;
    setDenivele({ state: 'loading' });
    void fetchElevations([a, b])
      .then((zs) => {
        if (cancelled) return;
        const zA = zs[0];
        const zB = zs[1];
        if (zA == null || zB == null) {
          setDenivele({ state: 'unavailable' });
          return;
        }
        const horizM = lineLengthMeters([a, b]);
        const { deltaZ, slopePct } = slopeBetween(zA, zB, horizM);
        const result: DeniveleResult = { zA, zB, deltaZ, slopePct, horizM };
        const id = (measureIdRef.current += 1);
        setMeasurements((prev) => [...prev, { id, tool: 'denivele', points: [a, b], denivele: result }]);
        setDenivele(null);
        setDraftPoints([]);
      })
      .catch(() => {
        if (!cancelled) setDenivele({ state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [measureTool, draftPoints]);

  // Curseur croix pendant la mesure + désactivation du zoom au double-clic pour TOUT outil de mesure
  // (pas seulement distance/surface : un double-clic en dénivelé/recul zoomait la carte de façon
  // inattendue et posait deux points confondus). Restaure le curseur au démontage/désactivation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (measureTool) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    const canvas = map.getCanvas();
    canvas.style.cursor = measureTool ? 'crosshair' : '';
    return () => {
      canvas.style.cursor = '';
    };
  }, [measureTool, mapReady]);

  // Échap : efface le BROUILLON en cours (sans toucher aux mesures figées ni quitter l'outil). On ignore
  // Échap quand le focus est dans un champ de saisie (recherche d'adresse) : sinon vider sa recherche
  // effacerait aussi le brouillon en cours.
  useEffect(() => {
    if (!measureTool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      setDraftPoints([]);
      setDenivele(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [measureTool]);

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
      onAddressPick?.({ insee: feature.citycode, address: feature.label });
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
      // Capture la caméra AVANT setStyle : un `setStyle(..., diff:false)` (rebuild complet) applique le
      // center/zoom par défaut du nouveau style (le plan IGN chargé par URL en porte un), ce qui
      // réinitialiserait la vue de l'utilisateur. On la restaure à l'identique après chargement (retour porteur).
      const camera = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
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
        map.jumpTo(camera); // restaure zoom/centre/pitch/bearing avant que l'effet soleil ne re-tourne
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

  // --- Outils de mesure (US-1.5 + v2) : métriques du BROUILLON et actions -------------------------
  const distanceMeters = useMemo(() => lineLengthMeters(draftPoints), [draftPoints]);
  const areaMeters = useMemo(() => polygonAreaMeters(draftPoints), [draftPoints]);
  const perimeterMeters = useMemo(() => polygonPerimeterMeters(draftPoints), [draftPoints]);
  // Anneau auto-intersectant : l'aire Turf devient algébrique (trompeuse). On la signale « invalide »
  // plutôt que d'afficher un chiffre faux (règles 1 et 3).
  const areaInvalid = useMemo(
    () => measureTool === 'surface' && draftPoints.length >= 3 && isSelfIntersectingRing(draftPoints),
    [measureTool, draftPoints],
  );

  // Sélectionne un outil : démarre un nouveau brouillon, en GARDANT les mesures déjà posées (v2, cumul).
  // Mesure et ensoleillement coexistent désormais (retour porteur) : on ne coupe plus le soleil.
  const selectMeasureTool = useCallback((t: MeasureTool) => {
    setMeasureTool(t);
    setDraftPoints([]);
    setDenivele(null);
  }, []);
  // Finalise le brouillon distance/surface (bouton « Terminer »).
  const finalizeDraft = useCallback(() => {
    if (measureTool !== 'distance' && measureTool !== 'surface') return;
    const min = measureTool === 'surface' ? 3 : 2;
    if (draftPoints.length < min) return;
    const id = (measureIdRef.current += 1);
    const tool = measureTool;
    setMeasurements((prev) => [...prev, { id, tool, points: draftPoints }]);
    setDraftPoints([]);
  }, [measureTool, draftPoints]);
  // Efface le brouillon en cours (garde les mesures figées).
  const clearDraft = useCallback(() => {
    setDraftPoints([]);
    setDenivele(null);
  }, []);
  // Efface TOUTES les mesures (figées + brouillon).
  const clearAllMeasures = useCallback(() => {
    setMeasurements([]);
    setDraftPoints([]);
    setDenivele(null);
  }, []);
  // Quitte le mode mesure : retire l'outil et efface tout (le tracé disparaît du plan).
  const exitMeasure = useCallback(() => {
    setMeasureTool(null);
    setMeasurements([]);
    setDraftPoints([]);
    setDenivele(null);
  }, []);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%' }}
        aria-label="Carte de sélection de parcelles"
      />

      {/* Bouton « agrandir » (fiche) : ouvre l'explorer plein écran focalisé sur le terrain. */}
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          aria-label="Ouvrir en grand dans l'explorer"
          title="Ouvrir en grand dans l'explorer"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: '9px',
            boxShadow: FLOAT_SHADOW,
            cursor: 'pointer',
            color: TEXT,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      )}

      {/* Voile d'ambiance de l'analyse d'ensoleillement (sous les panneaux, sans capter les clics) */}
      {sunAmbience && sunAmbience.overlay.opacity > 0.001 ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            pointerEvents: 'none',
            background: sunAmbience.overlay.color,
            opacity: sunAmbience.overlay.opacity,
            mixBlendMode: sunAmbience.overlay.blend,
          }}
        />
      ) : null}

      {/* Recherche : adresse + surface (haut-gauche) */}
      <div
        style={{
          position: 'absolute',
          left: '16px',
          top: '16px',
          width: '340px',
          maxWidth: 'calc(100% - 32px)',
          zIndex: 12,
          // Masqué en mode focalisé (fiche : sélection fixe) et, sur petit écran, PENDANT l'analyse
          // d'ensoleillement (la recherche n'y sert pas et libère l'écran, retour porteur).
          display: readOnly || (isNarrow && sunActive) ? 'none' : 'flex',
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
          // Borne la hauteur et rend la colonne défilante : sur un écran court, un panneau ouvert
          // (mesure ou ensoleillement) ne pousse plus la bascule de fond et la surface hors de vue.
          maxHeight: 'calc(100% - 32px)',
          overflowY: 'auto',
        }}
      >
        <div
          role="group"
          aria-label="Fond de carte"
          style={{
            alignSelf: 'flex-start',
            // Reste visible pendant l'analyse d'ensoleillement : on peut passer Plan/Satellite sans
            // en sortir (la surcouche 3D est réinstallée après le rechargement de style).
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
              {!readOnly && (
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
              )}
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

        {/* Déclencheur de l'analyse d'ensoleillement (en place, quand une parcelle est sélectionnée).
            Coexiste avec la mesure (retour porteur) : on peut mesurer pendant l'analyse. */}
        {selection.length > 0 && !sunActive && (
          <button
            type="button"
            onClick={() => setSunActive(true)}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              background: INDIGO,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '9px',
              padding: '9px 13px',
              fontFamily: SANS,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: FLOAT_SHADOW,
            }}
          >
            <span aria-hidden="true">☀</span>
            Analyser l&apos;ensoleillement
          </button>
        )}

        {/* Panneau de contrôle de l'analyse (heure + saison), en place */}
        {sunActive && (
          <div
            role="group"
            aria-label="Analyse d'ensoleillement"
            style={{
              width: '320px',
              maxWidth: 'calc(100% - 32px)',
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: '11px',
              padding: '12px 14px',
              boxShadow: FLOAT_SHADOW,
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={microLabel}>Ensoleillement (3D)</span>
              {/* Repli/dépli (petit écran seulement) : garde la carte visible sur téléphone. */}
              {isNarrow && (
                <button
                  type="button"
                  onClick={() => setSunPanelCollapsed((c) => !c)}
                  aria-expanded={!sunPanelCollapsed}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: PANEL,
                    color: SUB,
                    fontFamily: SANS,
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '5px 10px',
                    borderRadius: '8px',
                  }}
                >
                  {sunPanelCollapsed ? 'Plus d’options' : 'Moins'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSunActive(false)}
                aria-label="Quitter l'analyse et revenir à la carte"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: `1px solid ${BORDER}`,
                  background: PANEL,
                  color: TEXT,
                  fontFamily: SANS,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '5px 10px',
                  borderRadius: '8px',
                }}
              >
                <span aria-hidden="true">←</span>
                Quitter l&apos;analyse
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: SUB }}>
                <span>Heure</span>
                <span style={{ fontFamily: MONO, color: TEXT }}>
                  {pad2(Math.floor(sunMinutes / 60))}:{pad2(sunMinutes % 60)}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={1439}
                step={5}
                value={sunMinutes}
                onChange={(e) => setSunMinutes(Number(e.target.value))}
                aria-label="Heure de la journée"
                style={{ width: '100%' }}
              />
            </label>

            {/* Saison + repères : masqués quand le panneau est replié sur petit écran (heure seule). */}
            {!(isNarrow && sunPanelCollapsed) && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: SUB }}>
                    <span>Saison</span>
                    <span style={{ color: TEXT }}>
                      {seasonLabel(sunDate)} · {sunDate}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={364}
                    step={1}
                    value={dayOfYear(sunDate)}
                    onChange={(e) => setSunDate(dateForDayOfYear(Number(sunDate.slice(0, 4)), Number(e.target.value)))}
                    aria-label="Période de l'année"
                    style={{ width: '100%' }}
                  />
                </label>

                {/* Repères d'extrêmes (solstices/équinoxes) + remise à l'instant courant */}
                <div role="group" aria-label="Repères de saison" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {sunPresets.map((p) => {
                    const active = sunDate === p.date;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSunDate(p.date)}
                        style={{ ...presetChip, background: active ? INDIGO : '#EEF0F5', color: active ? '#FFFFFF' : TEXT }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={resetSun}
                    title="Revenir à aujourd'hui, 14:00"
                    style={{ ...presetChip, marginLeft: 'auto', background: 'transparent', color: SUB }}
                  >
                    Aujourd&apos;hui
                  </button>
                </div>
              </>
            )}

            <p style={{ margin: 0, fontSize: '12px', color: TEXT }}>
              {sunPos == null
                ? 'Parcelle sans géométrie.'
                : sunPos.altitudeDeg > 0.5
                  ? `Soleil à ${Math.round(sunPos.altitudeDeg)}° de hauteur.`
                  : "Soleil sous l'horizon (nuit)."}
            </p>
            {/* Détails (comptes, méthode) : masqués quand replié sur petit écran, SAUF chargement, erreur
                et toute INDISPONIBILITÉ de source (bâti/végétation/sans hauteur), qui doit rester visible
                même repliée (règle 3, jamais taire une donnée manquante). */}
            {(sunLoading || sunError || sunUnavail.b || sunUnavail.v || sunSansHauteur > 0 || !(isNarrow && sunPanelCollapsed)) && (
              <p
                role={sunError ? 'alert' : 'status'}
                aria-live="polite"
                style={{ margin: 0, fontSize: '11px', color: SUB }}
              >
                {sunLoading
                  ? 'Chargement des volumes 3D...'
                  : sunError
                    ? sunError
                    : `${sunUnavail.b ? 'Bâtiments indisponibles' : `${sunCounts.b} bâtiment${sunCounts.b > 1 ? 's' : ''}`}${sunSansHauteur > 0 ? ` (dont ${sunSansHauteur} sans hauteur connue, non ombré${sunSansHauteur > 1 ? 's' : ''})` : ''}, ${sunUnavail.v ? 'végétation indisponible' : `${sunCounts.v} zone${sunCounts.v > 1 ? 's' : ''} boisée${sunCounts.v > 1 ? 's' : ''}`}. Ombres du bâti et de la végétation projetées au sol (méthode simplifiée), sur le relief ombré selon le soleil (MNT, exagéré 1,2x). Canopée approximée.`}
              </p>
            )}
          </div>
        )}

        {/* Outils de mesure (US-1.5 + v2) : déclencheur, puis panneau distance / surface / dénivelé /
            recul. Disponible aussi pendant l'analyse d'ensoleillement (coexistence, retour porteur). */}
        {!measureTool && (
          <button
            type="button"
            onClick={() => selectMeasureTool('distance')}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              background: PANEL,
              color: TEXT,
              border: `1px solid ${BORDER}`,
              borderRadius: '9px',
              padding: '8px 12px',
              fontFamily: SANS,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: FLOAT_SHADOW,
            }}
          >
            <span aria-hidden="true">📐</span>
            Mesurer
          </button>
        )}

        {measureTool && (
          <div
            role="group"
            aria-label="Outils de mesure"
            style={{
              width: '320px',
              maxWidth: 'calc(100% - 32px)',
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: '11px',
              padding: '12px 14px',
              boxShadow: FLOAT_SHADOW,
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={microLabel}>Mesurer</span>
              <button
                type="button"
                onClick={exitMeasure}
                aria-label="Fermer les outils de mesure"
                style={{
                  border: `1px solid ${BORDER}`,
                  background: PANEL,
                  color: TEXT,
                  fontFamily: SANS,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '5px 10px',
                  borderRadius: '8px',
                }}
              >
                Fermer
              </button>
            </div>

            <div role="group" aria-label="Type de mesure" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {MEASURE_TOOL_LABELS.map((t) => {
                const active = measureTool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectMeasureTool(t.id)}
                    style={{ ...presetChip, background: active ? INDIGO : '#EEF0F5', color: active ? '#FFFFFF' : TEXT }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Lecture du BROUILLON en cours (le total suit au clic ; le direct sur l'axe est porté par
                les étiquettes carte). Chiffres sourcés, indisponibilité explicite. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }} aria-live="polite">
              {measureTool === 'distance' && (
                <>
                  <p style={measureReadoutMain}>
                    {draftPoints.length < 2
                      ? 'Cliquez les points ; double-clic pour terminer.'
                      : `Distance : ${formatMeters(distanceMeters)}`}
                  </p>
                  {draftPoints.length >= 2 && <p style={measureMethod}>Mesure géométrique (géodésique).</p>}
                </>
              )}
              {measureTool === 'surface' && (
                <>
                  <p style={measureReadoutMain}>
                    {draftPoints.length < 3
                      ? 'Cliquez au moins trois points ; double-clic pour fermer.'
                      : areaInvalid
                        ? 'Tracé invalide (arêtes croisées).'
                        : `Surface : ${formatSquareMeters(areaMeters)}`}
                  </p>
                  {draftPoints.length >= 3 && areaInvalid && (
                    <p style={measureReadoutSub}>Reprenez le contour sans croiser les côtés.</p>
                  )}
                  {draftPoints.length >= 3 && !areaInvalid && (
                    <p style={measureReadoutSub}>{`Périmètre : ${formatMeters(perimeterMeters)}`}</p>
                  )}
                  {draftPoints.length >= 3 && !areaInvalid && (
                    <p style={measureMethod}>Mesure géométrique (géodésique).</p>
                  )}
                </>
              )}
              {measureTool === 'denivele' && (
                <>
                  <p style={measureReadoutMain}>
                    {denivele == null
                      ? 'Cliquez deux points (A puis B).'
                      : denivele.state === 'partial'
                        ? 'Cliquez le second point (B).'
                        : denivele.state === 'loading'
                          ? 'Altitudes en cours...'
                          : denivele.state === 'error'
                            ? 'Altitude indisponible (source injoignable).'
                            : 'Altitude indisponible sur cette zone.'}
                  </p>
                  <p style={measureMethod}>Source : RGE ALTI (IGN). Δ affiché sur l'axe.</p>
                </>
              )}
              {measureTool === 'recul' && (
                <>
                  <p style={measureReadoutMain}>
                    {selection.length === 0
                      ? "Sélectionnez d'abord une parcelle."
                      : 'Cliquez un point pour mesurer le recul.'}
                  </p>
                  {selection.length > 0 && <p style={measureMethod}>Distance au contour cadastral (IGN).</p>}
                </>
              )}
              {measurements.length > 0 && (
                <p style={measureReadoutSub}>
                  {measurements.length} mesure{measurements.length > 1 ? 's' : ''} sur le plan.
                </p>
              )}
            </div>

            {/* Actions : finaliser (distance/surface), effacer le brouillon, tout effacer */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {(measureTool === 'distance' || measureTool === 'surface') &&
                draftPoints.length >= (measureTool === 'surface' ? 3 : 2) && (
                  <button type="button" onClick={finalizeDraft} style={{ ...presetChip, background: INDIGO, color: '#FFFFFF' }}>
                    Terminer
                  </button>
                )}
              {draftPoints.length > 0 && (
                <button type="button" onClick={clearDraft} style={{ ...presetChip, background: 'transparent', color: SUB }}>
                  Effacer
                </button>
              )}
              {(measurements.length > 0 || draftPoints.length > 0) && (
                <button type="button" onClick={clearAllMeasures} style={{ ...presetChip, background: 'transparent', color: AMBER }}>
                  Tout effacer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
