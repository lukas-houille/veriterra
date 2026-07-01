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

/**
 * Récupère une parcelle par son IDU (requête attributaire). Sans cache.
 * Attention : API Carto attend le numéro sur 4 caractères (zéros de tête conservés).
 * Limite connue : pour les communes à arrondissements (Lyon, Paris, Marseille), l'IDU
 * porte le code d'arrondissement alors que `code_insee` attend le code commune, donc la
 * requête peut échouer. Le chemin principal (création) n'utilise PAS cette fonction : il
 * persiste la donnée issue de la requête géométrique au clic (fetchParcelleAtPoint), qui
 * fait autorité. À réserver aux usages où seul l'IDU est connu (enrichissement futur).
 */
export async function fetchParcelleFromApiByIdu(idu: string): Promise<ParcelleData> {
  const { insee, section, numero } = parseIdu(idu);
  const feature = await queryApiCarto(
    new URLSearchParams({ code_insee: insee, section, numero, _limit: '1' }),
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

/** Parcelle candidate d'une recherche par zone (US-1.6). Sous-ensemble de ParcelleData. */
export interface ParcelleInZone {
  idu: string;
  commune: string;
  section: string;
  numero: string;
  surfaceM2: number;
  geojson: GeoJsonGeometry;
}

/** Résultat d'une recherche par emprise. `truncated` = plafond atteint (zone trop large). */
export interface ZoneParcellesResult {
  parcelles: ParcelleInZone[];
  truncated: boolean;
}

/** Plafond de features renvoyées par l'API Carto (au-delà, on invite à resserrer la zone). */
export const ZONE_PARCELLE_LIMIT = 1000;

/**
 * Récupère les parcelles cadastrales intersectant une emprise rectangulaire (bbox WGS84,
 * `[ouest, sud, est, nord]`), par requête géométrique API Carto. Pour US-1.6 (recherche
 * par surface approchée dans la zone explorée). `truncated` indique que le plafond est
 * atteint : le résultat est partiel, il faut resserrer la zone.
 */
export async function fetchParcellesInBbox(
  bbox: [number, number, number, number],
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<ZoneParcellesResult> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const limit = Math.min(Math.max(1, opts.limit ?? ZONE_PARCELLE_LIMIT), ZONE_PARCELLE_LIMIT);
  const geom = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  });
  const res = await fetch(
    `${APICARTO_PARCELLE_URL}?${new URLSearchParams({ geom, _limit: String(limit) }).toString()}`,
    opts.signal ? { signal: opts.signal } : undefined,
  );
  if (!res.ok) throw new Error(`API Carto a répondu ${res.status}`);
  const data = (await res.json()) as { features?: ApiCartoFeature[] };
  const features = data.features ?? [];
  // On écarte les parcelles sans contenance connue : la recherche par surface ne doit jamais
  // traiter une donnée indisponible comme un 0 m² (règles inviolables 1 et 3). `truncated`
  // reste calculé sur le nombre brut renvoyé (signal « zone au plafond »).
  const parcelles = features
    .filter((f) => typeof f.properties.contenance === 'number' && f.properties.contenance > 0)
    .map((feature) => {
      const p = normalizeParcelleFeature(feature, feature.properties.idu ?? '');
      return {
        idu: p.idu,
        commune: p.commune,
        section: p.section,
        numero: p.numero,
        surfaceM2: p.surfaceM2,
        geojson: p.geojson,
      };
    });
  return { parcelles, truncated: features.length >= limit };
}

/**
 * Garde les parcelles dont la surface est à ±tolérance de la cible (en m²). Fonction pure,
 * cœur de US-1.6 (recherche par surface approchée). Une tolérance négative est ramenée à sa
 * valeur absolue ; une cible <= 0 ne retient rien.
 */
export function filterBySurface<T extends { surfaceM2: number }>(
  parcelles: T[],
  targetM2: number,
  toleranceM2: number,
): T[] {
  if (!(targetM2 > 0)) return [];
  const tol = Math.abs(toleranceM2);
  return parcelles.filter((p) => Math.abs(p.surfaceM2 - targetM2) <= tol);
}
