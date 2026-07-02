import { getRedisConnection } from '@veriterra/shared';
import type { MultiPolygon, Polygon } from 'geojson';

// Client SERVEUR des bâtiments IGN BD TOPO (WFS Géoplateforme, public, sans clé), avec cache
// Redis best-effort (patron d'apicarto.ts). Ne pas importer côté navigateur (dépend de Redis).
// `hauteur` est la hauteur photogrammétrique IGN (m) ; absente ou 0 => null (règle 3, jamais 0
// silencieux). On ne garde que les bâtiments « En service ».

const WFS = 'https://data.geopf.fr/wfs/ows';
const CACHE_PREFIX = 'geo:batiment:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours (BD TOPO trimestrielle)
const MAX_FEATURES = 800;

/** Empreinte + hauteur d'un bâtiment, servie au client pour extrusion et ombres. */
export interface BatimentFeature {
  id: string;
  geometry: Polygon | MultiPolygon;
  hauteur: number | null;
}

/** bbox géographique [minLon, minLat, maxLon, maxLat] en WGS84. */
export type Bbox = [number, number, number, number];

export interface BatimentsResult {
  batiments: BatimentFeature[];
  transientError: boolean;
}

function normalizeHauteur(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse la FeatureCollection WFS en bâtiments normalisés (ignore le bâti non surfacique/hors service). */
export function parseBatiments(payload: unknown): BatimentFeature[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: BatimentFeature[] = [];
  for (const f of features) {
    const geom = (f as { geometry?: { type?: string } }).geometry;
    const props = ((f as { properties?: Record<string, unknown> }).properties ?? {}) as Record<string, unknown>;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) continue;
    const etat = props.etat_de_l_objet;
    if (typeof etat === 'string' && etat !== 'En service') continue;
    out.push({
      id: String((f as { id?: unknown }).id ?? out.length),
      geometry: geom as Polygon | MultiPolygon,
      hauteur: normalizeHauteur(props.hauteur),
    });
  }
  return out;
}

function wfsUrl(bbox: Bbox): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    typeNames: 'BDTOPO_V3:batiment',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    // WFS 2.0 en EPSG:4326 : ordre bbox lat,lon (minLat,minLon,maxLat,maxLon).
    bbox: `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`,
    count: String(MAX_FEATURES),
  });
  return `${WFS}?${params.toString()}`;
}

/** bbox (WGS84) d'un rayon en mètres autour d'un point. */
export function bboxAround(lon: number, lat: number, radiusM: number): Bbox {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/**
 * Bâtiments BD TOPO dans une bbox, avec cache Redis best-effort. Ne throw jamais : source
 * injoignable (réseau/5xx/429) => transientError (l'appelant renvoie une erreur, ne cache pas).
 */
export async function fetchBatimentsBbox(bbox: Bbox): Promise<BatimentsResult> {
  const key = `${CACHE_PREFIX}${bbox.map((n) => n.toFixed(4)).join(',')}`;
  try {
    const cached = await getRedisConnection().get(key);
    if (cached) return { batiments: JSON.parse(cached) as BatimentFeature[], transientError: false };
  } catch {
    // cache indisponible : on poursuit sans.
  }

  let payload: unknown = null;
  try {
    const res = await fetch(wfsUrl(bbox));
    if (res.status >= 500 || res.status === 429) return { batiments: [], transientError: true };
    if (res.ok) payload = await res.json();
  } catch {
    return { batiments: [], transientError: true };
  }

  const batiments = parseBatiments(payload);
  try {
    await getRedisConnection().set(key, JSON.stringify(batiments), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // écriture best-effort.
  }
  return { batiments, transientError: false };
}
