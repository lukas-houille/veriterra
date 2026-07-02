import type { BanFeature } from './types';

const BAN_SEARCH_URL = 'https://api-adresse.data.gouv.fr/search/';

interface BanRawFeature {
  properties: {
    label: string;
    citycode: string;
    city: string;
    postcode: string;
    /** housenumber | street | locality | municipality (optionnel selon la réponse BAN). */
    type?: string;
    score: number;
  };
  geometry: { coordinates: [number, number] };
}

function toBanFeature(f: BanRawFeature): BanFeature {
  return {
    label: f.properties.label,
    citycode: f.properties.citycode,
    city: f.properties.city,
    postcode: f.properties.postcode,
    type: f.properties.type ?? '',
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    score: f.properties.score,
  };
}

// Zoom cible selon la granularité du résultat BAN : une commune se cadre large, un numéro serré
// (le zoom 18 fixe « zoomait trop » sur une ville). Pur et testable.
const ZOOM_BY_BAN_TYPE: Record<string, number> = {
  municipality: 13,
  locality: 14,
  street: 16,
  housenumber: 17,
};

/** Zoom de survol adapté au type de résultat BAN, 15 par défaut pour un type inconnu. */
export function zoomForBanType(type: string): number {
  return ZOOM_BY_BAN_TYPE[type] ?? 15;
}

/**
 * Autocomplétion d'adresse via la Base Adresse Nationale (BAN, ouverte, sans clé).
 * Utilisable côté client (autocomplétion) et serveur. Rend une liste de candidats avec
 * leur code INSEE (`citycode`) et leurs coordonnées WGS84. Renvoie [] sous 3 caractères.
 */
export async function searchAddress(query: string, limit = 5): Promise<BanFeature[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${BAN_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=${limit}&autocomplete=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BAN a répondu ${res.status}`);
  const data = (await res.json()) as { features?: BanRawFeature[] };
  return (data.features ?? []).map(toBanFeature);
}
