import { safeGet } from './http';
import type { BlockConfidence, BlockStatus, PluData } from './types';

// Client PLU via l'IGN API Carto GPU (Géoportail de l'Urbanisme, public, sans clé). SANS IA :
// on ne récupère que ce qui vit dans les ATTRIBUTS (type et libellé de zone, document, statut
// RNU) et on construit un LIEN vers le règlement (hébergé sur le Géoportail de l'Urbanisme).
// L'extraction des règles chiffrées (hauteur, emprise, reculs) vit dans le texte du règlement et
// relèvera d'une slice IA ultérieure. Endpoints revérifiés en live à l'implémentation.

const APICARTO_GPU = 'https://apicarto.ign.fr/api/gpu';
const GPU_DOWNLOAD = 'https://www.geoportail-urbanisme.gouv.fr/document/download-by-partition/';
export const PLU_SOURCE = "Géoportail de l'Urbanisme (IGN)";
export const PLU_SOURCE_URL = 'https://www.geoportail-urbanisme.gouv.fr/';

export interface PluInput {
  lon: number;
  lat: number;
}

export interface PluFetchResult {
  data: PluData;
  transientError: boolean;
}

/** Propriétés de la première feature d'une FeatureCollection GeoJSON, ou null. */
function firstProps(value: unknown): Record<string, unknown> | null {
  const features = (value as { features?: unknown })?.features;
  if (Array.isArray(features) && features.length > 0) {
    const p = (features[0] as { properties?: unknown })?.properties;
    if (p && typeof p === 'object') return p as Record<string, unknown>;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

export interface ZoneInfo {
  typezone: string | null;
  libelle: string | null;
  libelong: string | null;
  partition: string | null;
  datvalid: string | null;
}

/** Extrait la zone d'urbanisme de la réponse zone-urba (première feature intersectée). */
export function pickZone(zoneUrba: unknown): ZoneInfo | null {
  const p = firstProps(zoneUrba);
  if (!p) return null;
  return {
    typezone: str(p.typezone),
    libelle: str(p.libelle),
    libelong: str(p.libelong),
    partition: str(p.partition),
    datvalid: str(p.datvalid),
  };
}

/** Lien de téléchargement du document (règlement + pièces) sur le Géoportail de l'Urbanisme. */
export function buildReglementUrl(partition: string | null): string | null {
  return partition ? `${GPU_DOWNLOAD}${encodeURIComponent(partition)}` : null;
}

function geomParam(lon: number, lat: number): string {
  return encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
}

const EMPTY: PluData = {
  typezone: null,
  zoneLibelle: null,
  zoneDescription: null,
  documentType: null,
  documentName: null,
  dateValidite: null,
  reglementUrl: null,
  isRnu: false,
  note: null,
};

/**
 * Récupère le zonage PLU d'un point via GPU (zone-urba + municipality + document en parallèle).
 * Ne throw jamais : source injoignable => transientError (réessai sans cache) ; commune au RNU
 * ou zonage non téléversé => indisponible avec note explicite (règle 3, jamais une zone par défaut).
 */
export async function fetchPlu(input: PluInput, signal?: AbortSignal): Promise<PluFetchResult> {
  const geom = geomParam(input.lon, input.lat);
  const [zoneRes, muniRes, docRes] = await Promise.all([
    safeGet(`${APICARTO_GPU}/zone-urba?geom=${geom}`, signal),
    safeGet(`${APICARTO_GPU}/municipality?geom=${geom}`, signal),
    safeGet(`${APICARTO_GPU}/document?geom=${geom}`, signal),
  ]);
  // Seul zone-urba porte la donnée autoritative (typezone, libellé, règlement). municipality
  // (détection RNU) et document (métadonnées décoratives) sont des données molles : leur panne
  // ne doit PAS masquer un zonage récupéré. On ne réessaie donc que si zone-urba est injoignable.
  if (zoneRes.transient) {
    return { data: { ...EMPTY }, transientError: true };
  }

  const muni = firstProps(muniRes.value);
  if (muni?.is_rnu === true) {
    return { data: { ...EMPTY, isRnu: true, note: 'Commune au RNU (pas de PLU/POS).' }, transientError: false };
  }

  const zone = pickZone(zoneRes.value);
  if (!zone || (!zone.typezone && !zone.libelle)) {
    return {
      data: {
        ...EMPTY,
        note: "Zonage non disponible sur le Géoportail de l'Urbanisme (document non téléversé ou hors couverture).",
      },
      transientError: false,
    };
  }

  const doc = firstProps(docRes.value);
  return {
    data: {
      typezone: zone.typezone,
      zoneLibelle: zone.libelle,
      zoneDescription: zone.libelong,
      documentType: str(doc?.du_type),
      documentName: str(doc?.grid_title),
      dateValidite: zone.datvalid ?? str(doc?.datvalid),
      reglementUrl: buildReglementUrl(zone.partition),
      isRnu: false,
      note: null,
    },
    transientError: false,
  };
}

/**
 * Synthèse d'un bloc PLU : OK si une zone a été trouvée, sinon UNAVAILABLE (RNU / hors couverture).
 * Confiance MOYENNE : zonage autoritatif mais servi en données « source » non normalisées CNIG
 * (le libellé n'est pas standardisé ; typezone U/AU/A/N reste le champ fiable).
 */
export function summarizePlu(data: PluData): { status: BlockStatus; confidence: BlockConfidence } {
  return { status: data.note ? 'UNAVAILABLE' : 'OK', confidence: 'MOYENNE' };
}
