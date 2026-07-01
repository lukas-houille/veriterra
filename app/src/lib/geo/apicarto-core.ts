import type { GeoJsonGeometry, ParcelleData } from './types';

// Cœur API Carto Cadastre, SANS dépendance serveur (pas de Redis) : utilisable côté
// navigateur (sélection de parcelle au clic) comme côté serveur (via le wrapper caché
// apicarto.ts). Endpoints IGN Géoplateforme à re-vérifier à l'implémentation.

const APICARTO_PARCELLE_URL = 'https://apicarto.ign.fr/api/cadastre/parcelle';

export class ParcelleNotFoundError extends Error {
  constructor(idu: string) {
    super(`Parcelle introuvable pour l'IDU ${idu}`);
    this.name = 'ParcelleNotFoundError';
  }
}

/** Découpe un IDU cadastral (14 caractères) : INSEE(5) + préfixe(3) + section(2) + numéro(4). */
export function parseIdu(idu: string): {
  insee: string;
  prefixe: string;
  section: string;
  numero: string;
} {
  const clean = idu.trim();
  if (clean.length !== 14) {
    throw new Error(`IDU invalide (14 caractères attendus), reçu : ${idu}`);
  }
  return {
    insee: clean.slice(0, 5),
    prefixe: clean.slice(5, 8),
    section: clean.slice(8, 10),
    numero: clean.slice(10, 14),
  };
}

interface ApiCartoFeature {
  properties: {
    idu?: string;
    section?: string;
    numero?: string;
    nom_com?: string;
    code_insee?: string;
    contenance?: number; // surface en m²
  };
  geometry: GeoJsonGeometry;
}

/** Normalise une feature API Carto en données parcellaires Veriterra. */
export function normalizeParcelleFeature(
  feature: ApiCartoFeature,
  fallbackIdu: string,
): ParcelleData {
  const p = feature.properties;
  return {
    idu: p.idu ?? fallbackIdu,
    commune: p.nom_com ?? p.code_insee ?? '',
    section: p.section ?? '',
    numero: p.numero ?? '',
    surfaceM2: Math.round(Number(p.contenance ?? 0)),
    geojson: feature.geometry,
    source: 'IGN API Carto Cadastre',
    fetchedAt: new Date().toISOString(),
  };
}

async function queryApiCarto(params: URLSearchParams): Promise<ApiCartoFeature | null> {
  const res = await fetch(`${APICARTO_PARCELLE_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`API Carto a répondu ${res.status}`);
  const data = (await res.json()) as { features?: ApiCartoFeature[] };
  return data.features?.[0] ?? null;
}

/** Récupère une parcelle par son IDU (requête attributaire). Sans cache. */
export async function fetchParcelleFromApiByIdu(idu: string): Promise<ParcelleData> {
  const { insee, section, numero } = parseIdu(idu);
  const feature = await queryApiCarto(
    new URLSearchParams({
      code_insee: insee,
      section,
      numero: String(Number(numero)), // API Carto attend le numéro sans zéros de tête
      _limit: '1',
    }),
  );
  if (!feature) throw new ParcelleNotFoundError(idu);
  return normalizeParcelleFeature(feature, idu);
}

/**
 * Récupère la parcelle contenant un point (lon/lat WGS84), par requête géométrique.
 * Utilisé côté client au clic sur la carte pour surligner et sélectionner la parcelle.
 * Renvoie `null` si aucune parcelle (hors cadastre vecteur).
 */
export async function fetchParcelleAtPoint(lon: number, lat: number): Promise<ParcelleData | null> {
  const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] });
  const feature = await queryApiCarto(new URLSearchParams({ geom, _limit: '1' }));
  return feature ? normalizeParcelleFeature(feature, feature.properties.idu ?? '') : null;
}
