import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { allShadows, type ShadowBuilding, type SunPos } from './shadows';

// Préparation PURE et testable du rendu de l'analyse d'ensoleillement (extrusion native MapLibre +
// ombres Turf), sans DOM ni réseau. Bâtiments et canopée sont des volumes uniformes (empreinte +
// hauteur) : le bâti porte la hauteur photogrammétrique BD TOPO (null si inconnue, règle 3), la
// canopée une hauteur APPROXIMÉE par type (volume visuel documenté, jamais une mesure). L'ombre est
// la projection au sol calculée par `shadows.ts` (règle 1), pas une valeur inventée.

/** Volume au sol : empreinte + hauteur (m). Bâtiment (hauteur possiblement null) ou canopée. */
export interface SunVolume {
  geometry: Polygon | MultiPolygon;
  hauteur: number | null;
}

/**
 * FeatureCollection pour l'extrusion native MapLibre (`fill-extrusion`). La hauteur est portée par
 * la propriété `hauteur` ; une hauteur inconnue (null) laisse l'expression `coalesce` retomber sur
 * 0, donc le volume n'est pas extrudé (règle 3 : pas de hauteur inventée).
 */
export function toExtrusionFC(items: SunVolume[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((it) => ({
      type: 'Feature',
      geometry: it.geometry,
      properties: { hauteur: it.hauteur },
    })),
  };
}

// Plancher d'altitude solaire pour le CALCUL de l'ombre : on garde une ombre INDICATIVE même soleil
// bas ou sous l'horizon (direction = azimut réel, longueur bornée par ce plancher) au lieu de la
// faire disparaître d'un coup. La visibilité (fondu) est gérée à part par `shadowFadeOpacity`.
const MIN_SHADOW_ALT_DEG = 3;

/**
 * Ombres au sol du bâti ET de la végétation, agrégées (Turf). Un volume sans hauteur ne projette
 * pas d'ombre (jamais d'ombre inventée) ; `sansHauteur` les compte pour l'afficher honnêtement.
 * L'altitude du soleil est bornée en bas (plancher) : l'ombre reste présente et orientée à l'azimut
 * réel au crépuscule et la nuit, elle s'estompe visuellement via l'opacité (pas d'apparition brutale).
 */
export function sunShadowsFor(
  buildings: SunVolume[],
  canopies: SunVolume[],
  sun: SunPos,
): { shadows: Array<Feature<Polygon>>; sansHauteur: number } {
  const clamped: SunPos = { azimuthDeg: sun.azimuthDeg, altitudeDeg: Math.max(sun.altitudeDeg, MIN_SHADOW_ALT_DEG) };
  const inputs: ShadowBuilding[] = [...buildings, ...canopies].map((v) => ({
    geometry: v.geometry,
    hauteur: v.hauteur,
  }));
  return allShadows(inputs, clamped);
}

/**
 * Opacité de l'ombre au sol en fondu doux selon la hauteur du soleil : faible mais PRÉSENTE la nuit
 * (plancher), plus dense quand le soleil monte. « Mappe » l'intensité et fait apparaître l'ombre
 * progressivement au lever, sans on/off brutal. Rendu, pas de la donnée (règles 1 et 3).
 */
export function shadowFadeOpacity(altitudeDeg: number): number {
  const FLOOR = 0.06;
  const MAX = 0.32;
  const t = Math.min(1, Math.max(0, altitudeDeg / 45));
  const smooth = t * t * (3 - 2 * t); // smoothstep
  return FLOOR + (MAX - FLOOR) * smooth;
}

/**
 * Exagération de l'ombrage du relief (hillshade) selon la hauteur du soleil : plus marquée quand le
 * soleil est bas (versants longuement ombrés), plus plate au zénith. Rendu visuel, pas une mesure.
 */
export function hillshadeExaggeration(altitudeDeg: number): number {
  const t = Math.min(1, Math.max(0, altitudeDeg / 45));
  return 0.75 - 0.45 * t; // 0.75 (soleil bas) -> 0.30 (soleil haut)
}
