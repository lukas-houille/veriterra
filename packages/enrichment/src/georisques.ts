import { safeGet } from './http';
import type { BlockConfidence, BlockStatus, RiskItem, RiskSeverity, RisquesData } from './types';

// Client Géorisques (API publique de l'État, sans clé). Endpoints revérifiés à
// l'implémentation : rga (retrait-gonflement des argiles), zonage_sismique, radon, et
// gaspar/risques (risques recensés, dont inondation). Fonctions pures et testables : chaque
// normalize* transforme la réponse brute (ou null) en RiskItem sourcé, en dégradant proprement
// en "donnée indisponible" (available = false) plutôt qu'en valeur par défaut (règle 3).

const BASE = 'https://georisques.gouv.fr/api/v1';
const SOURCE = 'Géorisques';
const SOURCE_URL = 'https://www.georisques.gouv.fr/';

/** Point de requête : coordonnées WGS84 + code INSEE de la commune. */
export interface GeorisquesInput {
  lon: number;
  lat: number;
  codeInsee: string;
}

function firstDataRow(payload: unknown): Record<string, unknown> | null {
  const data = (payload as { data?: unknown })?.data;
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
    return data[0] as Record<string, unknown>;
  }
  return null;
}

const base = (key: RiskItem['key'], label: string): Pick<RiskItem, 'key' | 'label' | 'source' | 'sourceUrl'> => ({
  key,
  label,
  source: SOURCE,
  sourceUrl: SOURCE_URL,
});
const unavailable = (key: RiskItem['key'], label: string): RiskItem => ({
  ...base(key, label),
  value: null,
  severity: null,
  available: false,
});

/** Argile (retrait-gonflement) : endpoint rga -> { codeExposition, exposition }. */
export function normalizeArgile(payload: unknown): RiskItem {
  const label = 'Retrait-gonflement des argiles';
  const p = payload as { codeExposition?: string; exposition?: string } | null;
  if (!p || !p.exposition) return unavailable('argile', label);
  const sev: Record<string, RiskSeverity> = { '1': 'info', '2': 'warning', '3': 'danger' };
  return {
    ...base('argile', label),
    value: p.exposition,
    severity: sev[String(p.codeExposition)] ?? 'info',
    available: true,
  };
}

/** Sismicité : endpoint zonage_sismique -> data[0].zone_sismicite ("2 - FAIBLE"). */
export function normalizeSismique(payload: unknown): RiskItem {
  const label = 'Sismicité';
  const row = firstDataRow(payload);
  const zone = row?.zone_sismicite;
  if (typeof zone !== 'string' || zone === '') return unavailable('sismicite', label);
  const digit = zone.trim()[0];
  const sev: Record<string, RiskSeverity> = { '1': 'info', '2': 'info', '3': 'warning', '4': 'danger', '5': 'danger' };
  return {
    ...base('sismicite', label),
    value: `Zone de sismicité ${zone}`,
    severity: sev[digit ?? ''] ?? 'info',
    available: true,
  };
}

/** Radon : endpoint radon -> data[0].classe_potentiel ("1" | "2" | "3"). */
export function normalizeRadon(payload: unknown): RiskItem {
  const label = 'Potentiel radon';
  const row = firstDataRow(payload);
  const classe = row?.classe_potentiel;
  if (classe == null || classe === '') return unavailable('radon', label);
  const c = String(classe);
  const sev: Record<string, RiskSeverity> = { '1': 'info', '2': 'warning', '3': 'danger' };
  const libelle: Record<string, string> = {
    '1': 'Potentiel faible (classe 1)',
    '2': 'Potentiel faible à moyen (classe 2)',
    '3': 'Potentiel significatif (classe 3)',
  };
  return {
    ...base('radon', label),
    value: libelle[c] ?? `Classe ${c}`,
    severity: sev[c] ?? 'info',
    available: true,
  };
}

/** Inondation : dérivée de gaspar/risques (présence d'un risque recensé "Inondation"). */
export function normalizeInondation(payload: unknown): RiskItem {
  const label = 'Inondation';
  const data = (payload as { data?: unknown })?.data;
  // Tableau vide = point non résolu à une commune : indisponible plutôt qu'un faux "aucun
  // risque" rassurant (règle 3), cohérent avec les autres risques.
  if (!Array.isArray(data) || data.length === 0) return unavailable('inondation', label);
  const libelles: string[] = [];
  for (const row of data) {
    const detail = (row as { risques_detail?: unknown })?.risques_detail;
    if (Array.isArray(detail)) {
      for (const d of detail) {
        const l = (d as { libelle_risque_long?: unknown })?.libelle_risque_long;
        if (typeof l === 'string') libelles.push(l);
      }
    }
  }
  const recensed = libelles.some((l) => l.toLowerCase().includes('inondation'));
  return {
    ...base('inondation', label),
    value: recensed ? 'Risque inondation recensé sur la commune' : 'Aucun risque inondation recensé',
    severity: recensed ? 'warning' : 'success',
    available: true,
  };
}

/** Résultat d'une récupération : données normalisées + drapeau de panne transitoire. */
export interface RisquesFetchResult {
  data: RisquesData;
  /** true si au moins une source était injoignable (réseau/5xx) : ne pas cacher, réessayer. */
  transientError: boolean;
}

/**
 * Récupère et normalise les 4 risques Géorisques pour un point. Ne throw jamais : une source
 * injoignable est signalée par `transientError` (l'appelant décide de réessayer sans cacher),
 * distinct d'une absence légitime de donnée (available = false sans transientError).
 */
export async function fetchRisquesGeorisques(
  input: GeorisquesInput,
  signal?: AbortSignal,
): Promise<RisquesFetchResult> {
  const latlon = encodeURIComponent(`${input.lon},${input.lat}`);
  const insee = encodeURIComponent(input.codeInsee);
  const [rga, sismique, radon, gaspar] = await Promise.all([
    safeGet(`${BASE}/rga?latlon=${latlon}`, signal),
    safeGet(`${BASE}/zonage_sismique?latlon=${latlon}`, signal),
    input.codeInsee
      ? safeGet(`${BASE}/radon?code_insee=${insee}`, signal)
      : Promise.resolve({ value: null, transient: false }),
    safeGet(`${BASE}/gaspar/risques?latlon=${latlon}`, signal),
  ]);
  return {
    data: {
      items: [
        normalizeArgile(rga.value),
        normalizeInondation(gaspar.value),
        normalizeRadon(radon.value),
        normalizeSismique(sismique.value),
      ],
    },
    transientError: rga.transient || sismique.transient || radon.transient || gaspar.transient,
  };
}

/**
 * Synthèse d'un bloc RISQUES : statut OK si au moins un risque couvert, sinon UNAVAILABLE
 * (aucune source n'a répondu). Confiance élevée (données publiques faisant autorité).
 */
export function summarizeRisques(data: RisquesData): { status: BlockStatus; confidence: BlockConfidence } {
  const anyAvailable = data.items.some((i) => i.available);
  return { status: anyAvailable ? 'OK' : 'UNAVAILABLE', confidence: 'ELEVEE' };
}
