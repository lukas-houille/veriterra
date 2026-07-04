import distance from '@turf/distance';
import area from '@turf/area';
import kinks from '@turf/kinks';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import type { Feature, MultiLineString, Point } from 'geojson';
import type { GeoJsonGeometry } from './types';

// Cœur PUR et testable des outils de mesure sur la carte (US-1.5), SANS dépendance carte/DOM
// (sauf fetchElevations, qui appelle l'API publique RGE ALTI d'IGN). Chaque valeur produite est
// CALCULÉE et explicable (règle 1), jamais inventée ; hors couverture => null, jamais un 0 (règle 3).
// Unités métriques partout (règle 4). Les distances Turf sont en kilomètres par défaut : on convertit
// en mètres (x1000).

/** Coordonnée WGS84 [lon, lat]. */
export type LngLat = [number, number];

const KM_TO_M = 1000;

/** Longueur géodésique totale (m) d'une polyligne. 0 si moins de deux points. */
export function lineLengthMeters(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += distance(coords[i - 1]!, coords[i]!) * KM_TO_M;
  }
  return total;
}

/** Ferme un anneau (ajoute le premier sommet à la fin s'il diffère du dernier). */
function closeRing(ring: LngLat[]): LngLat[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    return [...ring, first];
  }
  return ring;
}

/** Aire géodésique (m²) d'un anneau de sommets (fermé automatiquement). 0 si moins de 3 sommets. */
export function polygonAreaMeters(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  return area({ type: 'Polygon', coordinates: [closeRing(ring)] });
}

/** Périmètre géodésique (m) d'un anneau de sommets (fermé automatiquement). 0 si moins de 2 sommets. */
export function polygonPerimeterMeters(ring: LngLat[]): number {
  if (ring.length < 2) return 0;
  return lineLengthMeters(closeRing(ring));
}

/** Milieu d'un segment (moyenne des extrémités). Suffisant pour POSER une étiquette de mesure sur
 *  l'axe (courtes distances) : pas besoin d'un milieu géodésique. */
export function segmentMidpoint(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Centroïde simple (moyenne des sommets) d'un anneau, pour poser l'étiquette d'aire au centre. */
export function ringCentroid(ring: LngLat[]): LngLat | null {
  if (ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return [sx / ring.length, sy / ring.length];
}

/**
 * Vrai si l'anneau se croise lui-même (nœud papillon). Turf `area` renvoie alors une aire ALGÉBRIQUE
 * (différence des lobes), trompeuse par rapport au tracé : on préfère la signaler « invalide » plutôt
 * que d'afficher un chiffre faux (règles 1 et 3). Moins de 4 sommets ne peuvent pas se croiser.
 */
export function isSelfIntersectingRing(ring: LngLat[]): boolean {
  if (ring.length < 4) return false;
  try {
    return kinks({ type: 'Polygon', coordinates: [closeRing(ring)] }).features.length > 0;
  } catch {
    return false;
  }
}

export interface SlopeResult {
  /** Dénivelé signé zB - zA (m). */
  deltaZ: number;
  /** Pente en % = |deltaZ| / distance horizontale x 100 ; null si distance horizontale ~nulle. */
  slopePct: number | null;
}

/** Dénivelé et pente entre deux points d'altitudes connues, sur une distance horizontale (m). */
export function slopeBetween(zA: number, zB: number, horizontalM: number): SlopeResult {
  const deltaZ = zB - zA;
  const slopePct = horizontalM > 0.001 ? (Math.abs(deltaZ) / horizontalM) * 100 : null;
  return { deltaZ, slopePct };
}

export interface NearestBoundary {
  /** Distance la plus courte (m) du point au contour de la géométrie. */
  distanceM: number;
  /** Point du contour le plus proche (pour tracer le segment de recul). */
  nearestPoint: LngLat;
}

/** Anneaux de contour (extérieur + trous) d'une géométrie Polygon/MultiPolygon. */
function boundaryRings(geometry: GeoJsonGeometry): LngLat[][] {
  const rings: LngLat[][] = [];
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates as number[][][]) rings.push(ring as LngLat[]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates as number[][][][]) {
      for (const ring of poly) rings.push(ring as LngLat[]);
    }
  }
  return rings.filter((r) => r.length >= 2);
}

/**
 * Distance la plus courte d'un point au CONTOUR d'une parcelle (recul), et le point du contour le plus
 * proche. Renvoie null si la géométrie n'a aucun anneau exploitable (règle 3 : pas de distance inventée).
 */
export function nearestBoundaryDistance(point: LngLat, geometry: GeoJsonGeometry): NearestBoundary | null {
  const rings = boundaryRings(geometry);
  if (rings.length === 0) return null;
  const lines: MultiLineString = { type: 'MultiLineString', coordinates: rings };
  const snapped = nearestPointOnLine(lines, point) as Feature<Point, { dist?: number }>;
  const c = snapped.geometry.coordinates;
  const dist = (snapped.properties?.dist ?? 0) * KM_TO_M;
  return { distanceM: dist, nearestPoint: [c[0]!, c[1]!] };
}

// --- Altitudes RGE ALTI (IGN, API publique sans clé) --------------------------------------------
// Même endpoint et sentinelle que le bloc PENTE serveur (packages/enrichment/src/pente.ts), mais
// appelé DIRECTEMENT depuis le navigateur (CORS ouvert, aucune clé) sur le modèle de fetchParcelleAtPoint.

const RGE_ALTI_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const RGE_ALTI_RESOURCE = 'ign_rge_alti_wld';
/** Sous ce seuil, la valeur est la sentinelle "pas de donnée" du RGE ALTI (-99999 hors couverture). */
const NODATA_THRESHOLD = -9998;

/** Source à afficher pour les mesures d'altitude/dénivelé (règle 1). */
export const RGE_ALTI_SOURCE = 'RGE ALTI (IGN)';

/**
 * Altitudes (m) des points fournis via le RGE ALTI. Un point hors couverture (sentinelle NODATA)
 * revient à `null` (règle 3, jamais un 0 fabriqué). Throw si la source est injoignable ou répond mal
 * (l'appelant distingue alors "source indisponible" de "point hors couverture").
 */
export async function fetchElevations(points: LngLat[], signal?: AbortSignal): Promise<Array<number | null>> {
  if (points.length === 0) return [];
  const lon = encodeURIComponent(points.map((p) => p[0]).join('|'));
  const lat = encodeURIComponent(points.map((p) => p[1]).join('|'));
  const url = `${RGE_ALTI_URL}?lon=${lon}&lat=${lat}&resource=${RGE_ALTI_RESOURCE}&zonly=true`;
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`RGE ALTI a répondu ${res.status}`);
  const data = (await res.json()) as { elevations?: unknown };
  const elevations = data.elevations;
  if (!Array.isArray(elevations)) throw new Error('Réponse RGE ALTI invalide');
  return elevations.map((v) => (typeof v === 'number' && v > NODATA_THRESHOLD ? v : null));
}

// --- Formatage métrique français (règles 4 et 5) ------------------------------------------------

/** Distance en mètres, format français, une décimale (ex. « 123,4 m »). */
export function formatMeters(m: number): string {
  return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m`;
}

/** Surface en m², format français, arrondie (ex. « 1 234 m² »). */
export function formatSquareMeters(m2: number): string {
  return `${Math.round(m2).toLocaleString('fr-FR')} m²`;
}

/** Altitude/dénivelé en mètres, une décimale, signe conservé (ex. « -5,6 m »). */
export function formatSignedMeters(m: number): string {
  return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })} m`;
}

/** Pente en %, une décimale (ex. « 7,2 % »). */
export function formatPercent(pct: number): string {
  return `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}
