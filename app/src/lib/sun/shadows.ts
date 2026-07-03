import * as SunCalc from 'suncalc';
import transformTranslate from '@turf/transform-translate';
import convex from '@turf/convex';
import union from '@turf/union';
import { featureCollection, feature } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

// Analyse solaire, cœur PUR et testable (aucun DOM, aucun réseau). L'ombre d'un volume est son
// empreinte projetée au sol dans la direction opposée au soleil, de longueur hauteur/tan(h) : un
// polygone CALCULÉ et explicable (règle 1), jamais une valeur inventée. Sans hauteur ou la nuit :
// pas d'ombre (règle 3, on n'invente rien).
//
// Deux tracés d'ombre selon la forme du volume :
//  - bâti compact => ENVELOPPE CONVEXE de l'empreinte et de sa projection (approximation d'enveloppe,
//    correcte car l'empreinte est quasi convexe) ;
//  - canopée boisée (`sweep`) => BALAYAGE (somme de Minkowski) qui ÉPOUSE les creux. L'enveloppe
//    convexe d'une forêt qui ceinture une cuvette « remplirait » la cuvette et l'ombragerait toute
//    la journée (bug observé) ; le balayage garde l'ombre sur l'emprise réelle.

/** En dessous de cette altitude solaire, le soleil est trop bas : pas d'ombre fiable. */
const DAYLIGHT_MIN_ALT_DEG = 0.5;
/** Borne de longueur d'ombre (m) pour éviter des polygones dégénérés près de l'horizon. */
const MAX_SHADOW_M = 2000;
/** Au-delà, l'anneau d'un volume balayé est décimé avant fusion (borne le coût de l'union, l'ombre
 * restant une approximation documentée). */
const MAX_SWEEP_VERTICES = 48;

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

/** Anneaux extérieurs d'un Polygon/MultiPolygon (Polygon => son anneau 0 ; MultiPolygon => l'anneau 0 de chaque polygone). */
function outerRings(geom: Polygon | MultiPolygon): Position[][] {
  if (geom.type === 'Polygon') return geom.coordinates[0] ? [geom.coordinates[0]] : [];
  return geom.coordinates.map((poly) => poly[0]).filter((r): r is Position[] => Array.isArray(r));
}

/**
 * Décime les anneaux au-delà de `maxVerts` (garde le premier sommet et referme sur lui). Borne le
 * nombre de quadrilatères de balayage puis le coût de l'union. Approximation visuelle assumée
 * (l'ombre est déjà « méthode simplifiée »).
 */
function decimateGeometry(geom: Polygon | MultiPolygon, maxVerts: number): Polygon | MultiPolygon {
  const decimateRing = (ring: Position[]): Position[] => {
    if (ring.length <= maxVerts) return ring;
    const step = Math.ceil(ring.length / maxVerts);
    const out: Position[] = [];
    for (let i = 0; i < ring.length - 1; i += step) out.push(ring[i]!);
    out.push(ring[0]!); // referme l'anneau sur son premier sommet
    return out;
  };
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map(decimateRing) };
  }
  return { type: 'MultiPolygon', coordinates: geom.coordinates.map((poly) => poly.map(decimateRing)) };
}

/**
 * Quadrilatères de balayage : pour chaque arête (a,b) de l'anneau extérieur, le parallélogramme
 * (a,b,b',a') où a'/b' sont les sommets correspondants de l'empreinte translatée. Ils comblent la
 * bande entre l'empreinte et sa projection en PRÉSERVANT la concavité (contrairement à l'enveloppe
 * convexe). `src` et `moved` partagent la même structure d'anneaux (moved = translation de src).
 */
function sweptEdgeQuads(src: Polygon | MultiPolygon, moved: Polygon | MultiPolygon): Array<Feature<Polygon>> {
  const s = outerRings(src);
  const m = outerRings(moved);
  const quads: Array<Feature<Polygon>> = [];
  const ringCount = Math.min(s.length, m.length);
  for (let r = 0; r < ringCount; r++) {
    const sr = s[r]!;
    const mr = m[r]!;
    const n = Math.min(sr.length, mr.length);
    for (let i = 0; i + 1 < n; i++) {
      const a = sr[i]!;
      const b = sr[i + 1]!;
      const b2 = mr[i + 1]!;
      const a2 = mr[i]!;
      quads.push(feature<Polygon>({ type: 'Polygon', coordinates: [[a, b, b2, a2, a]] }));
    }
  }
  return quads;
}

/**
 * Ombre d'un volume CONCAVE et étendu (canopée) : somme de Minkowski de l'empreinte avec le segment
 * de projection (empreinte U empreinte translatée U quadrilatères de balayage), fusionnée en un seul
 * polygone. Épouse les creux : une forêt en fer à cheval n'ombre plus le centre du fer. L'empreinte
 * est décimée au-delà de MAX_SWEEP_VERTICES. Repli sur l'enveloppe convexe si la fusion échoue (le
 * résultat n'est alors jamais pire que l'ancien tracé).
 */
function sweptShadow(
  footprint: Polygon | MultiPolygon,
  length: number,
  bearing: number,
): Feature<Polygon | MultiPolygon> | null {
  const base = decimateGeometry(footprint, MAX_SWEEP_VERTICES);
  const src = feature(base);
  const moved = transformTranslate(src, length, bearing, { units: 'meters' });
  const movedGeom = moved.geometry as Polygon | MultiPolygon;
  const parts = featureCollection<Polygon | MultiPolygon>([
    src,
    moved,
    ...sweptEdgeQuads(base, movedGeom),
  ]);
  try {
    const merged = union(parts);
    if (merged) return merged;
  } catch {
    // Géométrie pathologique : on retombe sur l'enveloppe convexe (mieux que rien, jamais pire qu'avant).
  }
  return convex(featureCollection([src, moved]));
}

/**
 * Polygone d'ombre au sol d'un volume : empreinte projetée de L mètres dans la direction opposée au
 * soleil. Bâti compact (défaut) => enveloppe convexe (empreinte + projection). Canopée (`sweep`) =>
 * balayage épousant les creux. Renvoie null si hauteur absente ou soleil trop bas / couché.
 */
export function buildingShadow(
  footprint: Polygon | MultiPolygon,
  heightM: number | null,
  sun: SunPos,
  opts?: { sweep?: boolean },
): Feature<Polygon | MultiPolygon> | null {
  if (heightM == null || heightM <= 0 || !isDaylight(sun)) return null;
  const length = shadowLengthM(heightM, sun.altitudeDeg);
  if (!Number.isFinite(length) || length <= 0) return null;
  const shadowBearing = (sun.azimuthDeg + 180) % 360;
  if (opts?.sweep) return sweptShadow(footprint, length, shadowBearing);
  const src = feature(footprint);
  const moved = transformTranslate(src, length, shadowBearing, { units: 'meters' });
  return convex(featureCollection([src, moved]));
}

/** Un volume à ombrer : empreinte + hauteur (null si non renseignée) ; `sweep` pour les canopées. */
export interface ShadowBuilding {
  geometry: Polygon | MultiPolygon;
  hauteur: number | null;
  /** Volume concave et étendu (canopée) : ombre par balayage plutôt que par enveloppe convexe. Défaut false (bâti compact). */
  sweep?: boolean;
}

export interface ShadowResult {
  shadows: Array<Feature<Polygon | MultiPolygon>>;
  /** Nombre de volumes sans hauteur (exclus des ombres, affichés honnêtement, règle 3). */
  sansHauteur: number;
}

/** Ombres de tous les volumes : exclut et compte ceux sans hauteur (jamais d'ombre inventée). */
export function allShadows(buildings: ShadowBuilding[], sun: SunPos): ShadowResult {
  const shadows: Array<Feature<Polygon | MultiPolygon>> = [];
  let sansHauteur = 0;
  for (const b of buildings) {
    if (b.hauteur == null || b.hauteur <= 0) {
      sansHauteur += 1;
      continue;
    }
    const s = buildingShadow(b.geometry, b.hauteur, sun, { sweep: b.sweep });
    if (s) shadows.push(s);
  }
  return { shadows, sansHauteur };
}
