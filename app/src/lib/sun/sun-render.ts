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

/**
 * Ombres au sol du bâti ET de la végétation, agrégées (Turf). Un volume sans hauteur ou de nuit ne
 * projette pas d'ombre (jamais d'ombre inventée). `sansHauteur` compte les volumes exclus faute de
 * hauteur, pour l'afficher honnêtement.
 */
export function sunShadowsFor(
  buildings: SunVolume[],
  canopies: SunVolume[],
  sun: SunPos,
): { shadows: Array<Feature<Polygon>>; sansHauteur: number } {
  const inputs: ShadowBuilding[] = [...buildings, ...canopies].map((v) => ({
    geometry: v.geometry,
    hauteur: v.hauteur,
  }));
  return allShadows(inputs, sun);
}
