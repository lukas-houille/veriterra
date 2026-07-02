import { safeGet } from './http';
import type { BlockConfidence, BlockStatus, PenteData } from './types';

// Client RGE ALTI (IGN Géoplateforme, API publique sans clé) : altitude, pente et exposition.
// On échantillonne 5 points (centre + est/ouest/nord/sud) autour du centre de la parcelle en une
// requête, puis on dérive la pente et l'exposition par différences finies. La pente est une
// estimation (pas de valeur inventée) : confiance MOYENNE. Hors couverture => indisponible (règle 3).
// Endpoint revérifié à l'implémentation (comme les autres sources IGN).

const BASE = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const RESOURCE = 'ign_rge_alti_wld';
export const PENTE_SOURCE = 'RGE ALTI (IGN)';
export const PENTE_SOURCE_URL = 'https://geoservices.ign.fr/rgealti';

/** Demi-pas d'échantillonnage (m) : compromis entre bruit local et représentativité parcellaire. */
const SAMPLE_OFFSET_M = 20;
/** Sentinelle "pas de donnée" du RGE ALTI (renvoie -99999 hors couverture). */
const NODATA_THRESHOLD = -9998;
/** En dessous, on considère le terrain plat : pas d'exposition marquée. */
const FLAT_PCT = 0.5;
const EARTH_M_PER_DEG = 111320;

export interface PenteInput {
  lon: number;
  lat: number;
}

export interface PenteFetchResult {
  data: PenteData;
  /** true si la source était injoignable (réseau/5xx) : ne pas cacher, réessayer. */
  transientError: boolean;
}

/** Points [lon,lat] échantillonnés autour d'un centre : [centre, est, ouest, nord, sud]. */
export function samplePoints(lon: number, lat: number, offsetM = SAMPLE_OFFSET_M): Array<[number, number]> {
  const dLat = offsetM / EARTH_M_PER_DEG;
  const dLon = offsetM / (EARTH_M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return [
    [lon, lat],
    [lon + dLon, lat],
    [lon - dLon, lat],
    [lon, lat + dLat],
    [lon, lat - dLat],
  ];
}

const COMPASS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];

/** Libellé d'exposition (8 directions) depuis un cap boussole en degrés (0 = Nord, sens horaire). */
export function expositionLabel(bearingDeg: number): string {
  const norm = (((bearingDeg % 360) + 360) % 360) / 45;
  return COMPASS[Math.round(norm) % 8] ?? 'Nord';
}

export interface SlopeAspect {
  altitudeM: number;
  pentePct: number;
  penteDeg: number;
  expositionBearingDeg: number | null;
  expositionLabel: string | null;
}

/**
 * Pente et exposition depuis 5 altitudes [centre, est, ouest, nord, sud] et le demi-pas (m).
 * Différences finies : gradient (montant), pente = norme du gradient, exposition = direction de
 * descente (opposée au gradient) en cap boussole. Terrain quasi plat (< 0,5 %) : exposition null.
 */
export function computeSlopeAspect(
  z: [number, number, number, number, number],
  offsetM = SAMPLE_OFFSET_M,
): SlopeAspect {
  const [centre, est, ouest, nord, sud] = z;
  const fx = (est - ouest) / (2 * offsetM); // dz/dx (vers l'est)
  const fy = (nord - sud) / (2 * offsetM); // dz/dy (vers le nord)
  const ratio = Math.sqrt(fx * fx + fy * fy);
  const pentePct = ratio * 100;
  const penteDeg = (Math.atan(ratio) * 180) / Math.PI;
  if (pentePct < FLAT_PCT) {
    return { altitudeM: centre, pentePct, penteDeg, expositionBearingDeg: null, expositionLabel: null };
  }
  // Direction aval (descente) = -gradient. Cap boussole (0 = Nord, horaire) = atan2(est, nord).
  const bearing = (((Math.atan2(-fx, -fy) * 180) / Math.PI) + 360) % 360;
  return { altitudeM: centre, pentePct, penteDeg, expositionBearingDeg: bearing, expositionLabel: expositionLabel(bearing) };
}

const EMPTY: PenteData = {
  altitudeM: null,
  pentePct: null,
  penteDeg: null,
  expositionLabel: null,
  expositionBearingDeg: null,
  note: null,
};

/**
 * Récupère et dérive la topographie d'un point. Ne throw jamais : une source injoignable est
 * signalée par `transientError` (réessai sans cache), distincte d'une absence de couverture
 * (note explicite, sans transientError).
 */
export async function fetchPente(input: PenteInput, signal?: AbortSignal): Promise<PenteFetchResult> {
  const pts = samplePoints(input.lon, input.lat);
  const lon = encodeURIComponent(pts.map((p) => p[0]).join('|'));
  const lat = encodeURIComponent(pts.map((p) => p[1]).join('|'));
  const url = `${BASE}?lon=${lon}&lat=${lat}&resource=${RESOURCE}&zonly=true`;
  const { value, transient } = await safeGet(url, signal);
  if (transient) return { data: { ...EMPTY }, transientError: true };

  const elevations = (value as { elevations?: unknown })?.elevations;
  if (!Array.isArray(elevations) || elevations.length < 5 || !elevations.every((v) => typeof v === 'number')) {
    return { data: { ...EMPTY, note: 'Altitude indisponible sur cette zone.' }, transientError: false };
  }
  const zs = elevations as number[];
  if (zs.some((v) => v <= NODATA_THRESHOLD)) {
    return { data: { ...EMPTY, note: 'Zone hors couverture RGE ALTI.' }, transientError: false };
  }

  const r = computeSlopeAspect([zs[0]!, zs[1]!, zs[2]!, zs[3]!, zs[4]!]);
  return {
    data: {
      altitudeM: Math.round(r.altitudeM),
      pentePct: Math.round(r.pentePct * 10) / 10,
      penteDeg: Math.round(r.penteDeg * 10) / 10,
      expositionLabel: r.expositionLabel,
      expositionBearingDeg: r.expositionBearingDeg == null ? null : Math.round(r.expositionBearingDeg),
      note: null,
    },
    transientError: false,
  };
}

/**
 * Synthèse d'un bloc PENTE : OK si la pente a pu être dérivée, sinon UNAVAILABLE. Confiance
 * MOYENNE : altitude autoritative (RGE ALTI ~1 m) mais pente estimée par échantillonnage.
 */
export function summarizePente(data: PenteData): { status: BlockStatus; confidence: BlockConfidence } {
  return { status: data.pentePct == null ? 'UNAVAILABLE' : 'OK', confidence: 'MOYENNE' };
}
