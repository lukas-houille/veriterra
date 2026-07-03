import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { allShadows, type ShadowBuilding, type ShadowResult, type SunPos } from './shadows';

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

/**
 * Ombres au sol du bâti ET de la végétation, agrégées (Turf). Le bâti compact est ombré par
 * enveloppe convexe ; la canopée (concave, étendue) par BALAYAGE, qui épouse les creux au lieu de
 * les combler (une forêt ceinturant une cuvette n'ombre plus toute la cuvette). Un volume sans
 * hauteur, ou le soleil sous l'horizon, ne projette pas d'ombre (jamais d'ombre inventée) : la nuit,
 * aucune géométrie n'est produite (l'ombre disparaît complètement). `sansHauteur` compte les volumes
 * exclus faute de hauteur, pour l'afficher honnêtement. La visibilité de jour suit un fondu
 * (`shadowFadeOpacity`).
 */
export function sunShadowsFor(buildings: SunVolume[], canopies: SunVolume[], sun: SunPos): ShadowResult {
  const inputs: ShadowBuilding[] = [
    ...buildings.map((v) => ({ geometry: v.geometry, hauteur: v.hauteur, sweep: false })),
    ...canopies.map((v) => ({ geometry: v.geometry, hauteur: v.hauteur, sweep: true })),
  ];
  return allShadows(inputs, sun);
}

/**
 * Opacité de l'ombre au sol en fondu selon la hauteur du soleil : NULLE sous l'horizon (l'ombre a
 * complètement disparu la nuit), puis elle réapparaît en fondu au lever et se densifie quand le
 * soleil monte. « Mappe » l'intensité, sans on/off brutal. Rendu, pas de la donnée (règles 1 et 3).
 */
export function shadowFadeOpacity(altitudeDeg: number): number {
  const MAX = 0.32;
  if (altitudeDeg <= 0) return 0; // soleil sous l'horizon : aucune ombre
  const t = Math.min(1, altitudeDeg / 20); // fondu du lever (0°) jusqu'à 20° de hauteur
  const smooth = t * t * (3 - 2 * t); // smoothstep
  return MAX * smooth;
}

/**
 * Exagération de l'ombrage du relief (hillshade) selon la hauteur du soleil : plus marquée quand le
 * soleil est bas (versants longuement ombrés), plus plate au zénith. Rendu visuel, pas une mesure.
 */
export function hillshadeExaggeration(altitudeDeg: number): number {
  const t = Math.min(1, Math.max(0, altitudeDeg / 45));
  return 0.75 - 0.45 * t; // 0.75 (soleil bas) -> 0.30 (soleil haut)
}
