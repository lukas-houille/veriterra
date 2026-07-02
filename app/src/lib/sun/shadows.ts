import * as SunCalc from 'suncalc';
import transformTranslate from '@turf/transform-translate';
import convex from '@turf/convex';
import { featureCollection, feature } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

// Analyse solaire, cœur PUR et testable (aucun DOM, aucun réseau). L'ombre d'un bâtiment est
// son empreinte projetée au sol dans la direction opposée au soleil, de longueur hauteur/tan(h) :
// un polygone CALCULÉ et explicable (règle 1), jamais une valeur inventée. Sans hauteur ou la
// nuit : pas d'ombre (règle 3, on n'invente rien).

/** En dessous de cette altitude solaire, le soleil est trop bas : pas d'ombre fiable. */
const DAYLIGHT_MIN_ALT_DEG = 0.5;
/** Borne de longueur d'ombre (m) pour éviter des polygones dégénérés près de l'horizon. */
const MAX_SHADOW_M = 2000;

export interface SunPos {
  /** Azimut en cap boussole (0 = Nord, sens horaire). */
  azimuthDeg: number;
  /** Hauteur du soleil au-dessus de l'horizon (négative la nuit). */
  altitudeDeg: number;
}

/**
 * Position du soleil (SunCalc) : azimut en cap boussole (0 = Nord, sens horaire) et altitude.
 * NB : ce build de suncalc (2.0.0, ESM) renvoie DÉJÀ des degrés et un azimut « north-based
 * clockwise » (0=N, 90=E, 180=S, 270=O), voir le commentaire de sa fonction azimuth(). On les
 * prend tels quels (au contraire de l'API historique en radians depuis le sud, que décrivent à
 * tort les @types/suncalc). Le test « midi solaire => azimut ~180 » verrouille cette convention.
 */
export function sunPosition(date: Date, lat: number, lon: number): SunPos {
  const p = SunCalc.getPosition(date, lat, lon);
  return {
    azimuthDeg: ((p.azimuth % 360) + 360) % 360,
    altitudeDeg: p.altitude,
  };
}

/** Vrai si le soleil est assez haut pour projeter une ombre exploitable. */
export function isDaylight(sun: SunPos): boolean {
  return sun.altitudeDeg > DAYLIGHT_MIN_ALT_DEG;
}

/** Longueur d'ombre au sol (m) pour une hauteur et une altitude solaire, bornée. */
export function shadowLengthM(heightM: number, altitudeDeg: number): number {
  const raw = heightM / Math.tan((altitudeDeg * Math.PI) / 180);
  return Math.min(raw, MAX_SHADOW_M);
}

/**
 * Polygone d'ombre au sol d'un bâtiment : empreinte projetée de L mètres dans la direction
 * opposée au soleil, puis enveloppe convexe (empreinte + projection). Approximation d'enveloppe
 * (l'ombre réelle est le balayage entre les deux), explicable. Renvoie null si hauteur absente
 * ou soleil trop bas / couché.
 */
export function buildingShadow(
  footprint: Polygon | MultiPolygon,
  heightM: number | null,
  sun: SunPos,
): Feature<Polygon> | null {
  if (heightM == null || heightM <= 0 || !isDaylight(sun)) return null;
  const length = shadowLengthM(heightM, sun.altitudeDeg);
  if (!Number.isFinite(length) || length <= 0) return null;
  const shadowBearing = (sun.azimuthDeg + 180) % 360;
  const src = feature(footprint);
  const moved = transformTranslate(src, length, shadowBearing, { units: 'meters' });
  return convex(featureCollection([src, moved]));
}

/** Un bâtiment à ombrer : empreinte + hauteur (null si non renseignée dans la source). */
export interface ShadowBuilding {
  geometry: Polygon | MultiPolygon;
  hauteur: number | null;
}

export interface ShadowResult {
  shadows: Array<Feature<Polygon>>;
  /** Nombre de bâtiments sans hauteur (exclus des ombres, affichés honnêtement, règle 3). */
  sansHauteur: number;
}

/** Ombres de tous les bâtiments : exclut et compte ceux sans hauteur (jamais d'ombre inventée). */
export function allShadows(buildings: ShadowBuilding[], sun: SunPos): ShadowResult {
  const shadows: Array<Feature<Polygon>> = [];
  let sansHauteur = 0;
  for (const b of buildings) {
    if (b.hauteur == null || b.hauteur <= 0) {
      sansHauteur += 1;
      continue;
    }
    const s = buildingShadow(b.geometry, b.hauteur, sun);
    if (s) shadows.push(s);
  }
  return { shadows, sansHauteur };
}
