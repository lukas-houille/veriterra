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

  // Analyse d'ensoleillement EN PLACE : bascule 3D + relief natif + bâti/canopée extrudés + ombres Turf.
  const [sunActive, setSunActive] = useState(false);
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
      // Le relief reste en place (permanent) : on repasse seulement à plat et on réinitialise le ciel.
      try {
        map.setSky({}); // réinitialise le ciel (retour en 2D).
      } catch {
        // pas de ciel : rien à faire.
      }
      map.easeTo({ pitch: 0, bearing: 0 });
      // La sélection a été vidée pendant l'analyse : on referme le panneau (pas de demi-état).
      if (sunActive && !sunCentroid) setSunActive(false);
      return;
    }

    // Le relief est déjà chargé (permanent) ; on (ré)ajoute les calques bâti/canopée/ombres/hillshade.
    // Idempotent : rejoué aussi après une bascule de fond de carte (setStyle a remis le style à zéro,
    // cet effet re-tourne via `mapReady`).
    installSunLayers(map);

    // Rechargement de style à centroïde INCHANGÉ (bascule Plan/Satellite) : on repeuple depuis les
    // données déjà chargées, SANS re-fetch ni re-cadrage caméra (l'utilisateur garde sa vue 3D).
    const cached = sunDataRef.current;
    if (cached && sunFetchedKeyRef.current === centroidKey) {
      populateSunSources(map, cached, sunCentroid, sunDateRef.current, sunMinutesRef.current, setSunSansHauteur);
      return;
    }

    // Entrée dans l'analyse (ou changement de sélection) : on cadre la vue 3D et on charge les volumes.
    map.easeTo({
      center: [sunCentroid.lon, sunCentroid.lat],
      zoom: Math.max(map.getZoom(), 16.5),
      pitch: 55,
      bearing: -20,
    });

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

    map.on('click', (e) => {
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

    return () => {
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
          // Masqué en mode focalisé (fiche) : pas de recherche d'adresse/surface, la sélection est fixe.
          display: readOnly ? 'none' : 'flex',
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

        {/* Déclencheur de l'analyse d'ensoleillement (en place, quand une parcelle est sélectionnée) */}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={microLabel}>Ensoleillement (3D)</span>
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

            <p style={{ margin: 0, fontSize: '12px', color: TEXT }}>
              {sunPos == null
                ? 'Parcelle sans géométrie.'
                : sunPos.altitudeDeg > 0.5
                  ? `Soleil à ${Math.round(sunPos.altitudeDeg)}° de hauteur.`
                  : "Soleil sous l'horizon (nuit)."}
            </p>
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
          </div>
        )}
      </div>
    </div>
  );
}
