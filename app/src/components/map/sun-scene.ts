import { MapboxOverlay } from '@deck.gl/mapbox';
import { AmbientLight, LightingEffect, _SunLight } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { Map as MaplibreMap, IControl } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';

// Scène soleil deck.gl (impérative, chargée en LAZY par l'explorer, jamais en SSR ni au repos).
// Attache un MapboxOverlay INTERLEAVED sur une carte MapLibre existante : les bâtiments et la
// canopée deviennent des volumes 3D qui projettent de VRAIES ombres GPU (temps réel), pilotées par
// _SunLight (direction dérivée du timestamp = heure + saison, et de la lat/lon de la vue). C'est du
// rendu, pas de la donnée : la hauteur de canopée est approximée, l'ombre est calculée par le GPU.

export interface SunSceneData {
  /** Bâtiments (propriété `height` en m, 0 si hauteur inconnue => non extrudé, règle 3). */
  buildings: FeatureCollection;
  /** Canopée végétale (propriété `height` en m, approximée). */
  canopies: FeatureCollection;
  /** Instant du soleil : epoch ms (heure + saison). */
  timestamp: number;
}

export interface SunSceneHandle {
  update(data: SunSceneData): void;
  destroy(): void;
}

const BUILDING_COLOR: [number, number, number] = [201, 205, 218];
const CANOPY_COLOR: [number, number, number, number] = [92, 138, 74, 205];

function elevationOf(f: { properties?: Record<string, unknown> | null }): number {
  const h = f.properties?.height;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : 0;
}

function buildEffect(timestamp: number): LightingEffect {
  const ambient = new AmbientLight({ color: [255, 255, 255], intensity: 1.1 });
  const sun = new _SunLight({ timestamp, color: [255, 255, 240], intensity: 1.6, _shadow: true });
  const effect = new LightingEffect({ ambient, sun });
  // Ombre un peu adoucie (teinte + alpha 0-255). Rendu, pas de la donnée.
  effect.shadowColor = [18, 22, 38, 90];
  return effect;
}

/** Crée la scène soleil sur une carte MapLibre. `update` (ré)injecte données + instant ; `destroy` retire l'overlay. */
export function createSunScene(map: MaplibreMap): SunSceneHandle {
  const overlay = new MapboxOverlay({ interleaved: true, layers: [], effects: [] });
  map.addControl(overlay as unknown as IControl);

  function update({ buildings, canopies, timestamp }: SunSceneData): void {
    const canopyLayer = new GeoJsonLayer({
      id: 'sun-canopy',
      data: canopies,
      extruded: true,
      filled: true,
      getElevation: elevationOf,
      getFillColor: CANOPY_COLOR,
      material: { ambient: 0.6, diffuse: 0.6, shininess: 8, specularColor: [30, 30, 30] },
    });
    const buildingLayer = new GeoJsonLayer({
      id: 'sun-buildings',
      data: buildings,
      extruded: true,
      filled: true,
      getElevation: elevationOf,
      getFillColor: BUILDING_COLOR,
      material: { ambient: 0.5, diffuse: 0.7, shininess: 32, specularColor: [40, 40, 40] },
    });
    overlay.setProps({ layers: [canopyLayer, buildingLayer], effects: [buildEffect(timestamp)] });
  }

  return {
    update,
    destroy: () => {
      try {
        map.removeControl(overlay as unknown as IControl);
      } catch {
        // overlay déjà retiré (démontage concurrent) : rien à faire.
      }
    },
  };
}
