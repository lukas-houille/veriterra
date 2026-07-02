import { safeGet } from './http';
import type { BlockConfidence, BlockStatus, ServiceItem, ServicesData } from './types';

// Client services de proximité via Overpass (OpenStreetMap). Autour du centre de la parcelle,
// on cherche écoles, commerces et transports dans un rayon fixe, puis on renvoie pour chaque
// catégorie la distance au plus proche et le nombre trouvé. Overpass EXIGE un User-Agent (sinon
// 406) et peut renvoyer 429/504 (transitoire). Couverture OSM inégale => confiance MOYENNE, et
// "aucun dans le rayon" est une réponse réelle (pas un 0 silencieux, règle 3).

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const SERVICES_SOURCE = 'OpenStreetMap (Overpass)';
export const SERVICES_SOURCE_URL = 'https://www.openstreetmap.org/';
// Overpass bloque les requêtes sans User-Agent identifiable.
const USER_AGENT = 'Veriterra/1.0 (enrichissement services de proximité)';
const RADIUS_M = 1500;

export interface ServicesInput {
  lon: number;
  lat: number;
}

export interface ServicesFetchResult {
  data: ServicesData;
  transientError: boolean;
}

type ServiceKey = ServiceItem['key'];

const CATEGORIES: Array<{ key: ServiceKey; label: string }> = [
  { key: 'ecoles', label: 'Écoles' },
  { key: 'commerces', label: 'Commerces' },
  { key: 'transports', label: 'Transports' },
];

const SCHOOL_AMENITIES = new Set(['school', 'kindergarten', 'college', 'university']);
const TRANSPORT_RAILWAYS = new Set(['station', 'tram_stop', 'halt', 'subway_entrance']);

/** Distance en mètres entre deux points WGS84 (formule de haversine). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Élément OSM tel que renvoyé par Overpass (node avec lat/lon, ou way/relation avec center). */
export interface OsmElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Classe un élément OSM dans une catégorie de service, ou null s'il n'en relève pas. */
export function classifyService(tags: Record<string, string> | undefined): ServiceKey | null {
  if (!tags) return null;
  if (tags.amenity && SCHOOL_AMENITIES.has(tags.amenity)) return 'ecoles';
  if (tags.highway === 'bus_stop' || tags.public_transport || (tags.railway && TRANSPORT_RAILWAYS.has(tags.railway))) {
    return 'transports';
  }
  if (tags.shop) return 'commerces';
  return null;
}

/** Position [lat, lon] d'un élément OSM (node direct, sinon centre des way/relation). */
function positionOf(el: OsmElement): [number, number] | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return [el.lat, el.lon];
  if (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') {
    return [el.center.lat, el.center.lon];
  }
  return null;
}

/** Agrège les éléments OSM en distance au plus proche + nombre, par catégorie. */
export function summarizeElements(
  elements: OsmElement[],
  origin: { lat: number; lon: number },
): ServiceItem[] {
  const nearest = new Map<ServiceKey, number>();
  const count = new Map<ServiceKey, number>();
  for (const el of elements) {
    const key = classifyService(el.tags);
    if (!key) continue;
    const pos = positionOf(el);
    if (!pos) continue;
    const d = haversineM(origin.lat, origin.lon, pos[0], pos[1]);
    count.set(key, (count.get(key) ?? 0) + 1);
    const prev = nearest.get(key);
    if (prev == null || d < prev) nearest.set(key, d);
  }
  return CATEGORIES.map(({ key, label }) => {
    const n = nearest.get(key);
    return { key, label, nearestM: n == null ? null : Math.round(n / 10) * 10, count: count.get(key) ?? 0 };
  });
}

function overpassQuery(lat: number, lon: number, radiusM: number): string {
  const a = `around:${radiusM},${lat},${lon}`;
  return (
    `[out:json][timeout:25];(` +
    `nwr(${a})[amenity~"^(school|kindergarten|college|university)$"];` +
    `nwr(${a})[shop];` +
    `nwr(${a})[highway=bus_stop];` +
    `nwr(${a})[public_transport];` +
    `nwr(${a})[railway~"^(station|tram_stop|halt|subway_entrance)$"];` +
    `);out center tags;`
  );
}

const emptyData = (radiusM: number, note: string | null): ServicesData => ({
  radiusM,
  items: CATEGORIES.map(({ key, label }) => ({ key, label, nearestM: null, count: 0 })),
  note,
});

/**
 * Récupère et agrège les services de proximité autour d'un point. Ne throw jamais : Overpass
 * injoignable (réseau/5xx/429) => transientError (réessai sans cache) ; réponse illisible =>
 * indisponible avec note. Un rayon sans service donne des `nearestM: null` (réponse réelle).
 */
export async function fetchServices(input: ServicesInput, signal?: AbortSignal): Promise<ServicesFetchResult> {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(overpassQuery(input.lat, input.lon, RADIUS_M))}`;
  const { value, transient } = await safeGet(url, signal, { 'User-Agent': USER_AGENT });
  if (transient) return { data: emptyData(RADIUS_M, null), transientError: true };

  const elements = (value as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) {
    return { data: emptyData(RADIUS_M, 'Services indisponibles (source illisible).'), transientError: false };
  }
  const items = summarizeElements(elements as OsmElement[], { lat: input.lat, lon: input.lon });
  return { data: { radiusM: RADIUS_M, items, note: null }, transientError: false };
}

/**
 * Synthèse d'un bloc SERVICES : OK dès que la requête a abouti (même si une catégorie est vide,
 * c'est une réponse réelle) ; UNAVAILABLE seulement si la source est illisible. Confiance MOYENNE
 * (complétude OSM inégale selon les zones).
 */
export function summarizeServices(data: ServicesData): { status: BlockStatus; confidence: BlockConfidence } {
  return { status: data.note ? 'UNAVAILABLE' : 'OK', confidence: 'MOYENNE' };
}
