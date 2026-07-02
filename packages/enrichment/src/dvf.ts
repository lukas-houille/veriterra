import { safeGet } from './http';
import type { BlockConfidence, BlockStatus, DvfComparable, PrixDvfData } from './types';

// Client DVF (Demandes de Valeurs Foncières) via l'API officielle Etalab (app.dvf.etalab.gouv.fr).
// Donnée granulaire (transactions notariées) : on filtre les ventes de terrain pur (sans bâti)
// du secteur et on calcule une médiane €/m² avec fourchette et nombre de comparables, jamais un
// chiffre sec (règle 1). C'est la même donnée DVF qu'agrège Géoportail, mais au niveau transaction.

const DVF_BASE = 'https://app.dvf.etalab.gouv.fr/api';
export const DVF_SOURCE = 'DVF (Etalab, valeurs foncières)';
export const DVF_SOURCE_URL = 'https://app.dvf.etalab.gouv.fr/';

const MIN_COMPARABLES = 3;
const HIGH_CONFIDENCE_COMPARABLES = 8;
const MAX_PRIX_M2 = 100_000; // garde-fou anti-aberration (erreurs de saisie DVF)
const RECENT_LIMIT = 5;

// DVF n'existe pas en Alsace-Moselle (livre foncier) ni à Mayotte.
const HORS_COUVERTURE_DEP = ['57', '67', '68'];

/** Vrai si la commune est hors couverture DVF (Alsace-Moselle, Mayotte). */
export function isHorsCouvertureDvf(codeInsee: string): boolean {
  if (codeInsee.startsWith('976')) return true;
  return HORS_COUVERTURE_DEP.includes(codeInsee.slice(0, 2));
}

/** Une ligne brute de l'API DVF (une mutation peut avoir plusieurs lignes). */
interface DvfLine {
  id_mutation?: string;
  date_mutation?: string;
  nature_mutation?: string;
  valeur_fonciere?: string;
  type_local?: string;
  surface_terrain?: string;
  code_nature_culture?: string;
  nature_culture?: string;
}

// Ventes de gré à gré pertinentes pour un comparable de terrain (on écarte VEFA, adjudication,
// échange, non représentatifs d'un prix de marché).
const VENTES = new Set(['Vente', 'Vente terrain à bâtir']);

/** Une ligne est du terrain à bâtir (code cadastral AB) et non de la terre agricole/bois/sols. */
function isBuildableLand(l: DvfLine): boolean {
  return l.code_nature_culture === 'AB' || l.nature_culture === 'Terrain à bâtir';
}

/**
 * Extrait les comparables de TERRAIN À BÂTIR d'une liste de lignes DVF (une entrée par mutation).
 * Ne conserve qu'une mutation ENTIÈREMENT en terrain à bâtir (code AB), sans bâti (type_local) et
 * sans parcelle agricole mêlée : sinon on mélangerait des terres à quelques euros/m² avec du
 * constructible, ou on diviserait la valeur totale par une surface partielle (chiffre faux,
 * règle 1). Le prix rural agricole n'est volontairement PAS estimé ici (cas d'usage : terrain à
 * bâtir). Limite connue : une mutation à cheval sur plusieurs sections n'est vue que par sa
 * section interrogée ; la médiane amortit ce cas rare. Fonction pure et testable.
 */
export function landComparables(lines: DvfLine[]): DvfComparable[] {
  const byMutation = new Map<
    string,
    { valeur: number; date: string; hasBati: boolean; buildableSurface: number; hasOtherLand: boolean }
  >();
  for (const l of lines) {
    if (!l.id_mutation || !VENTES.has(l.nature_mutation ?? '')) continue;
    const cur = byMutation.get(l.id_mutation) ?? {
      valeur: Number(l.valeur_fonciere),
      date: l.date_mutation ?? '',
      hasBati: false,
      buildableSurface: 0,
      hasOtherLand: false,
    };
    if (l.type_local && l.type_local !== 'None') cur.hasBati = true;
    const st = Number(l.surface_terrain);
    if (Number.isFinite(st) && st > 0) {
      if (isBuildableLand(l)) cur.buildableSurface += st;
      else cur.hasOtherLand = true;
    }
    byMutation.set(l.id_mutation, cur);
  }
  const out: DvfComparable[] = [];
  for (const m of byMutation.values()) {
    // Terrain à bâtir pur : ni bâti, ni parcelle non constructible mêlée (valeur non imputable).
    if (m.hasBati || m.hasOtherLand) continue;
    if (!(m.valeur > 0) || !(m.buildableSurface > 0)) continue;
    const prixM2 = m.valeur / m.buildableSurface;
    if (prixM2 > MAX_PRIX_M2) continue; // garde-fou anti-aberration (erreurs de saisie DVF)
    out.push({ date: m.date, prixM2, surfaceM2: m.buildableSurface, valeur: m.valeur });
  }
  return out;
}

/** Percentile (interpolation linéaire) d'une liste NON triée. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] as number;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return (sorted[lo] as number) * (1 - frac) + (sorted[hi] as number) * frac;
}

/** Statistiques de prix à partir des comparables. Sous le seuil, pas d'estimation (règle 3). */
export function computePrixDvf(comparables: DvfComparable[]): PrixDvfData {
  const n = comparables.length;
  if (n < MIN_COMPARABLES) {
    return {
      estimationM2: null,
      fourchetteBasseM2: null,
      fourchetteHauteM2: null,
      nbComparables: n,
      dernieresVentes: [],
      note: 'Comparables de terrains insuffisants dans le secteur',
    };
  }
  const prices = comparables.map((c) => c.prixM2);
  const recent = [...comparables]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_LIMIT)
    .map((c) => ({
      date: c.date,
      prixM2: Math.round(c.prixM2),
      surfaceM2: Math.round(c.surfaceM2),
      valeur: Math.round(c.valeur),
    }));
  return {
    estimationM2: Math.round(percentile(prices, 50)),
    fourchetteBasseM2: Math.round(percentile(prices, 25)),
    fourchetteHauteM2: Math.round(percentile(prices, 75)),
    nbComparables: n,
    dernieresVentes: recent,
    note: null,
  };
}

/** Synthèse d'un bloc PRIX_DVF : statut et confiance (selon le nombre de comparables). */
export function summarizePrixDvf(data: PrixDvfData): { status: BlockStatus; confidence: BlockConfidence } {
  if (data.estimationM2 == null) return { status: 'UNAVAILABLE', confidence: 'FAIBLE' };
  return {
    status: 'OK',
    confidence: data.nbComparables >= HIGH_CONFIDENCE_COMPARABLES ? 'ELEVEE' : 'MOYENNE',
  };
}

/** Section cadastrale à interroger : commune INSEE + section sur 5 caractères (préfixe + section). */
export interface DvfSection {
  commune: string;
  section: string;
}

/** Point de requête DVF : sections du terrain + code INSEE (pour la couverture). */
export interface DvfInput {
  codeInsee: string;
  sections: DvfSection[];
}

export interface PrixDvfFetchResult {
  data: PrixDvfData;
  transientError: boolean;
}

/**
 * Récupère et agrège les comparables DVF pour les sections d'un terrain. Hors couverture =
 * indisponible explicite (règle 3). Une source injoignable est signalée par `transientError`
 * (à réessayer, non caché). Ne throw jamais.
 */
export async function fetchPrixDvf(input: DvfInput, signal?: AbortSignal): Promise<PrixDvfFetchResult> {
  if (isHorsCouvertureDvf(input.codeInsee)) {
    return {
      data: {
        estimationM2: null,
        fourchetteBasseM2: null,
        fourchetteHauteM2: null,
        nbComparables: 0,
        dernieresVentes: [],
        note: 'Hors couverture DVF (Alsace-Moselle ou Mayotte), estimation à saisir manuellement',
      },
      transientError: false,
    };
  }
  let transientError = false;
  const lines: DvfLine[] = [];
  const seen = new Set<string>();
  for (const s of input.sections) {
    const key = `${s.commune}/${s.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const res = await safeGet(`${DVF_BASE}/mutations3/${s.commune}/${s.section}`, signal);
    if (res.transient) {
      transientError = true;
      continue;
    }
    const muts = (res.value as { mutations?: DvfLine[] } | null)?.mutations;
    if (Array.isArray(muts)) lines.push(...muts);
  }
  return { data: computePrixDvf(landComparables(lines)), transientError };
}
