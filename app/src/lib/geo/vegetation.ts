import { getRedisConnection } from '@veriterra/shared';
import type { Polygon } from 'geojson';
import type { Bbox } from './batiment';

// Client SERVEUR de la végétation OSM (Overpass), pour la CANOPÉE approximée de l'analyse
// d'ensoleillement. On récupère les emprises boisées (bois, forêt, broussaille) et on leur donne
// une hauteur de canopée APPROXIMÉE par type. Ce n'est PAS une mesure sourcée (règle 3) : c'est un
// volume visuel documenté, pour que la végétation projette une ombre plausible, sans simuler
// chaque arbre. Cache Redis best-effort. Overpass exige un User-Agent (sinon 406) et peut renvoyer
// 429/504 (transitoire, à réessayer, pas de cache).

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'Veriterra/1.0 (canopee vegetale, analyse ensoleillement)';
const CACHE_PREFIX = 'geo:vegetation:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours (couvert végétal stable)
const MAX_ELEMENTS = 400;

/** Hauteur de canopée APPROXIMÉE par type d'occupation (m). Approximation visuelle, pas une mesure.
 * Volontairement basse (les emprises OSM englobent souvent des lisières et des trouées) pour ne pas
 * sur-évaluer l'ombre portée des zones boisées. */
const CANOPY_HEIGHT_M: Record<string, number> = { wood: 10, forest: 10, scrub: 2 };

/** Emprise de canopée : géométrie + hauteur approximée. Même forme que BatimentFeature (uniforme). */
export interface CanopyFeature {
  id: string;
  geometry: Polygon;
  hauteur: number;
}

export interface VegetationResult {
  canopees: CanopyFeature[];
  transientError: boolean;
}

interface OverpassWay {
  id?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

function canopyHeightFor(tags: Record<string, string> | undefined): number | null {
  if (!tags) return null;
  if (tags.natural === 'wood') return CANOPY_HEIGHT_M.wood ?? null;
  if (tags.landuse === 'forest') return CANOPY_HEIGHT_M.forest ?? null;
  if (tags.natural === 'scrub') return CANOPY_HEIGHT_M.scrub ?? null;
  return null;
}

/** Convertit les ways Overpass (out geom) fermées en Polygon GeoJSON + hauteur approximée. */
export function parseCanopies(payload: unknown): CanopyFeature[] {
  const elements = (payload as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const out: CanopyFeature[] = [];
  for (const el of elements as OverpassWay[]) {
    const geom = el.geometry;
    const h = canopyHeightFor(el.tags);
    if (h == null || !Array.isArray(geom) || geom.length < 3) continue;
    const ring: number[][] = geom.map((p) => [p.lon, p.lat]);
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0]!, first[1]!]);
    if (ring.length < 4) continue; // au moins un triangle fermé
    out.push({ id: String(el.id ?? out.length), geometry: { type: 'Polygon', coordinates: [ring] }, hauteur: h });
  }
  return out;
}

function overpassQuery(bbox: Bbox): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const b = `${minLat},${minLon},${maxLat},${maxLon}`;
  return (
    `[out:json][timeout:25];(` +
    `way["natural"="wood"](${b});` +
    `way["landuse"="forest"](${b});` +
    `way["natural"="scrub"](${b});` +
    `);out geom ${MAX_ELEMENTS};`
  );
}

/**
 * Emprises boisées OSM dans une bbox (canopée approximée), avec cache Redis best-effort. Ne throw
 * jamais : Overpass injoignable (réseau/5xx/429) => transientError (réessai, pas de cache).
 */
export async function fetchVegetationBbox(bbox: Bbox): Promise<VegetationResult> {
  const key = `${CACHE_PREFIX}${bbox.map((n) => n.toFixed(4)).join(',')}`;
  try {
    const cached = await getRedisConnection().get(key);
    if (cached) return { canopees: JSON.parse(cached) as CanopyFeature[], transientError: false };
  } catch {
    // cache indisponible : on poursuit sans.
  }

  let payload: unknown;
  try {
    const url = `${OVERPASS_URL}?data=${encodeURIComponent(overpassQuery(bbox))}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { canopees: [], transientError: true };
    payload = await res.json();
  } catch {
    return { canopees: [], transientError: true };
  }

  const canopees = parseCanopies(payload);
  try {
    await getRedisConnection().set(key, JSON.stringify(canopees), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // écriture best-effort.
  }
  return { canopees, transientError: false };
}
