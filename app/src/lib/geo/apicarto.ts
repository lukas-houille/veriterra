import { getRedisConnection } from '@veriterra/shared';
import type { GeoJsonGeometry, ParcelleData } from './types';

const APICARTO_PARCELLE_URL = 'https://apicarto.ign.fr/api/cadastre/parcelle';
const CACHE_PREFIX = 'geo:parcelle:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours (données cadastrales publiques)

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

async function fetchFromApiCarto(idu: string): Promise<ParcelleData> {
  const { insee, section, numero } = parseIdu(idu);
  const params = new URLSearchParams({
    code_insee: insee,
    section,
    numero: String(Number(numero)), // API Carto attend le numéro sans zéros de tête
    _limit: '1',
  });
  const res = await fetch(`${APICARTO_PARCELLE_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`API Carto a répondu ${res.status} pour l'IDU ${idu}`);
  const data = (await res.json()) as { features?: ApiCartoFeature[] };
  const feature = data.features?.[0];
  if (!feature) throw new ParcelleNotFoundError(idu);
  return normalizeParcelleFeature(feature, idu);
}

/**
 * Récupère les données faisant autorité d'une parcelle par son IDU (IGN API Carto), avec
 * cache Redis best-effort (données publiques réutilisables). Appelé côté serveur à la
 * création d'un terrain : on ne fait jamais confiance à la géométrie envoyée par le client.
 */
export async function fetchParcelleByIdu(idu: string): Promise<ParcelleData> {
  const key = `${CACHE_PREFIX}${idu}`;
  try {
    const cached = await getRedisConnection().get(key);
    if (cached) return JSON.parse(cached) as ParcelleData;
  } catch {
    // cache indisponible : on poursuit sans.
  }
  const parcelle = await fetchFromApiCarto(idu);
  try {
    await getRedisConnection().set(key, JSON.stringify(parcelle), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // écriture de cache best-effort.
  }
  return parcelle;
}
