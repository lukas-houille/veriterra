import type { PenteData, PluData, PrixDvfData, RisquesData, ServicesData } from '@veriterra/enrichment';

// Moteur de score PUR et testable (aucune DB, aucun réseau). Le score est DÉRIVÉ des données
// déjà sourcées (règle 1 : chaque critère porte sa base explicable, jamais un chiffre inventé),
// et RELATIF au projet quand il est défini. Un critère sans donnée est « non évalué » (score
// null, jamais 0, règle 3) et exclu du global renormalisé sur les seuls critères évalués.

export type CriterionKey =
  | 'prix'
  | 'constructibilite'
  | 'georisques'
  | 'ensoleillement'
  | 'pente'
  | 'services'
  | 'trajet'
  | 'tension';

export interface CriterionScore {
  key: CriterionKey;
  label: string;
  weight: number;
  /** 0-100, ou null si la donnée nécessaire n'est pas (encore) disponible (règle 3). */
  score: number | null;
  /** Explication sourcée et lisible (ex. « +12 % vs estimation DVF »). */
  basis: string;
  /** true si la note a été forcée manuellement (US-3.1). */
  overridden?: boolean;
  /** Note d'origine (dérivée des données) au moment de l'override, figée : peut être null (critère
   *  non évalué, règle 3). Traçabilité (règle 1). */
  originalScore?: number | null;
  /** Base explicative d'origine, figée à la pose de l'override, conservée pour la traçabilité. */
  originalBasis?: string;
  /** Justification manuelle brute (pour ré-édition), distincte de `basis` qui sert l'affichage. */
  overrideNote?: string | null;
}

/** Correction manuelle d'un critère (US-3.1) : note forcée + justification optionnelle, plus la
 *  trace figée de la valeur d'origine (renseignée depuis la persistance). */
export interface CriterionOverride {
  /** Note manuelle 0-100 (bornée à l'application). */
  score: number;
  /** Justification libre saisie par l'utilisateur (devient la base affichée si présente). */
  note?: string | null;
  /** Note d'origine figée à la pose (persistée). Absente => on retombe sur la valeur dérivée
   *  courante ; `null` = le critère n'était pas évalué à l'origine (règle 3, jamais un 0 fabriqué). */
  originalScore?: number | null;
  /** Base explicative d'origine figée à la pose (persistée). */
  originalBasis?: string | null;
}

export type RedFlagKey = 'non_constructible' | 'inondable' | 'hors_dvf';
export interface RedFlag {
  key: RedFlagKey;
  label: string;
}

export interface ScoreResult {
  /** Score global 0-100 (moyenne pondérée des critères évalués), ou null si aucun évalué. */
  global: number | null;
  criteria: CriterionScore[];
  redFlags: RedFlag[];
  /** Nombre de critères réellement évalués (sur `criteria.length`). */
  evaluated: number;
}

export interface ScoringInput {
  prixDemande: number | null;
  surfaceTotaleM2: number;
  budgetMax: number | null;
  surfaceMinM2: number | null;
  surfaceMaxM2: number | null;
  risques?: RisquesData | null;
  prixDvf?: PrixDvfData | null;
  pente?: PenteData | null;
  services?: ServicesData | null;
  plu?: PluData | null;
}

const clamp = (n: number): number => Math.min(100, Math.max(0, n));

interface CritDef {
  key: CriterionKey;
  label: string;
  weight: number;
  compute: (input: ScoringInput) => { score: number | null; basis: string };
}

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

function scorePrix(input: ScoringInput): { score: number | null; basis: string } {
  const est = input.prixDvf?.estimationM2 ?? null;
  // est <= 0 (théoriquement impossible côté DVF) traité comme absent, jamais un « au marché » fabriqué.
  if (est == null || est <= 0 || input.prixDemande == null || input.surfaceTotaleM2 <= 0) {
    return { score: null, basis: 'estimation DVF ou prix demandé indisponible' };
  }
  const estTotal = est * input.surfaceTotaleM2;
  const ecart = estTotal > 0 ? (input.prixDemande - estTotal) / estTotal : 0;
  // Sous le marché => haut, au marché (~70), au-dessus => bas. Barème doux (100 pts pour -30 %).
  let score = 70 - ecart * 100;
  let extra = '';
  if (input.budgetMax != null && input.prixDemande > input.budgetMax) {
    score -= 20;
    extra = ', au-dessus du budget';
  }
  const pct = Math.round(ecart * 100);
  return { score: clamp(score), basis: `${pct > 0 ? '+' : ''}${pct} % vs estimation DVF${extra}` };
}

function scoreConstructibilite(input: ScoringInput): { score: number | null; basis: string } {
  const plu = input.plu;
  const t = (plu?.typezone ?? '').toUpperCase();
  if (!plu || t === '') return { score: null, basis: plu?.note ?? 'zonage PLU indisponible' };
  const label = plu.zoneLibelle ?? t;
  if (t.startsWith('AU')) return { score: 65, basis: `zone à urbaniser (${label})` };
  if (t.startsWith('U')) return { score: 90, basis: `zone urbaine (${label})` };
  if (t.startsWith('A')) return { score: 15, basis: `zone agricole (${label})` };
  if (t.startsWith('N')) return { score: 12, basis: `zone naturelle (${label})` };
  return { score: 55, basis: `zone ${label}` };
}

function scoreGeorisques(input: ScoringInput): { score: number | null; basis: string } {
  const items = input.risques?.items?.filter((i) => i.available) ?? [];
  if (items.length === 0) return { score: null, basis: 'risques indisponibles' };
  let score = 100;
  let dangers = 0;
  let warnings = 0;
  for (const i of items) {
    if (i.severity === 'danger') {
      score -= 35;
      dangers += 1;
    } else if (i.severity === 'warning') {
      score -= 15;
      warnings += 1;
    }
  }
  const parts: string[] = [];
  if (dangers) parts.push(`${dangers} aléa${dangers > 1 ? 's' : ''} fort${dangers > 1 ? 's' : ''}`);
  if (warnings) parts.push(`${warnings} modéré${warnings > 1 ? 's' : ''}`);
  return { score: clamp(score), basis: parts.length ? parts.join(', ') : 'aucun aléa notable' };
}

const EXPOSITION_SCORE: Record<string, number> = {
  Sud: 95,
  'Sud-Est': 88,
  'Sud-Ouest': 85,
  Est: 65,
  Ouest: 62,
  'Nord-Est': 45,
  'Nord-Ouest': 42,
  Nord: 28,
};

function scoreEnsoleillement(input: ScoringInput): { score: number | null; basis: string } {
  const pente = input.pente;
  if (!pente || pente.pentePct == null) return { score: null, basis: 'exposition indisponible' };
  if (pente.expositionLabel == null) {
    return { score: 70, basis: 'terrain plat, sans exposition marquée (détail à venir)' };
  }
  const score = EXPOSITION_SCORE[pente.expositionLabel] ?? 60;
  return { score, basis: `exposition ${pente.expositionLabel} (ensoleillement détaillé à venir)` };
}

function scorePente(input: ScoringInput): { score: number | null; basis: string } {
  const p = input.pente?.pentePct ?? null;
  if (p == null) return { score: null, basis: 'pente indisponible' };
  let score: number;
  if (p < 3) score = 95;
  else if (p < 7) score = 82;
  else if (p < 12) score = 62;
  else if (p < 20) score = 38;
  else score = 15;
  return { score, basis: `${nf1.format(p)} % de pente` };
}

function scoreServices(input: ScoringInput): { score: number | null; basis: string } {
  const items = input.services?.items ?? [];
  if (items.length === 0) return { score: null, basis: 'services indisponibles' };
  const sub = items.map((it) => {
    if (it.nearestM == null) return 15;
    if (it.nearestM < 300) return 100;
    if (it.nearestM < 700) return 78;
    if (it.nearestM < 1200) return 55;
    return 35;
  });
  const score = Math.round(sub.reduce((a, b) => a + b, 0) / sub.length);
  const present = items.filter((i) => i.nearestM != null).length;
  return { score, basis: `${present}/${items.length} catégories à proximité` };
}

const nullCrit = (basis: string) => (): { score: number | null; basis: string } => ({ score: null, basis });

const CRITERIA: CritDef[] = [
  { key: 'prix', label: 'Prix et écart au marché', weight: 20, compute: scorePrix },
  { key: 'constructibilite', label: 'Constructibilité', weight: 15, compute: scoreConstructibilite },
  { key: 'georisques', label: 'Risques', weight: 15, compute: scoreGeorisques },
  { key: 'ensoleillement', label: 'Ensoleillement et exposition', weight: 15, compute: scoreEnsoleillement },
  { key: 'pente', label: 'Pente et topographie', weight: 10, compute: scorePente },
  { key: 'services', label: 'Services de proximité', weight: 10, compute: scoreServices },
  { key: 'trajet', label: 'Trajet-travail', weight: 10, compute: nullCrit('donnée à venir') },
  { key: 'tension', label: 'Tension communale', weight: 5, compute: nullCrit('donnée à venir') },
];

/** Alertes rouges (US-3.4) : points bloquants qui pèsent via leur critère, sans exclure le terrain. */
function computeRedFlags(input: ScoringInput): RedFlag[] {
  const flags: RedFlag[] = [];
  const t = (input.plu?.typezone ?? '').toUpperCase();
  if (input.plu && ((t.startsWith('A') && !t.startsWith('AU')) || t.startsWith('N'))) {
    flags.push({ key: 'non_constructible', label: 'Zone non constructible (PLU)' });
  }
  const inond = input.risques?.items?.find((i) => i.key === 'inondation' && i.available);
  if (inond && inond.severity != null && inond.severity !== 'success') {
    flags.push({ key: 'inondable', label: 'Risque inondation recensé' });
  }
  if (input.prixDvf && input.prixDvf.estimationM2 == null) {
    flags.push({ key: 'hors_dvf', label: 'Prix de marché indisponible (hors DVF)' });
  }
  return flags;
}

/**
 * Calcule le score d'un terrain : par critère (0-100 ou null), global pondéré renormalisé sur
 * les critères évalués (null si aucun), et alertes rouges. Déterministe et sans effet de bord.
 */
export function scoreTerrain(input: ScoringInput): ScoreResult {
  const criteria: CriterionScore[] = CRITERIA.map((c) => {
    const { score, basis } = c.compute(input);
    return { key: c.key, label: c.label, weight: c.weight, score, basis };
  });
  let weighted = 0;
  let weightSum = 0;
  let evaluated = 0;
  for (const c of criteria) {
    if (c.score != null) {
      weighted += c.score * c.weight;
      weightSum += c.weight;
      evaluated += 1;
    }
  }
  return {
    global: weightSum > 0 ? Math.round(weighted / weightSum) : null,
    criteria,
    redFlags: computeRedFlags(input),
    evaluated,
  };
}

export const CRITERIA_COUNT = CRITERIA.length;

/** Liste ordonnée des clés de critères (source unique pour la validation serveur des overrides). */
export const CRITERION_KEYS: readonly CriterionKey[] = CRITERIA.map((c) => c.key);

/** Garde de type : true si `value` est une clé de critère connue. */
export function isCriterionKey(value: string): value is CriterionKey {
  return (CRITERION_KEYS as readonly string[]).includes(value);
}

/**
 * Applique des overrides manuels à un résultat de score (US-3.1) et RE-RENORMALISE le global sur
 * les critères désormais évalués (un override d'un critère jusque-là non évalué, ex. trajet/tension,
 * l'intègre au global). Fonction PURE : la trace de la valeur d'origine (`originalScore`/
 * `originalBasis`) affichée est celle FIGÉE à la pose de l'override quand elle est fournie (règle 1 :
 * elle ne doit pas suivre un ré-enrichissement ultérieur) ; à défaut on retombe sur la valeur dérivée
 * courante. Un critère non évalué garde `originalScore` à null (jamais un 0 fabriqué, règle 3). Les
 * alertes rouges (dérivées des données) restent inchangées.
 */
export function applyOverrides(
  result: ScoreResult,
  overrides: Map<CriterionKey, CriterionOverride>,
): ScoreResult {
  if (overrides.size === 0) return result;
  const criteria: CriterionScore[] = result.criteria.map((c) => {
    const ov = overrides.get(c.key);
    if (!ov) return c;
    const note = ov.note?.trim();
    // Trace figée si l'override la porte (originalScore défini, même à null) ; sinon dérivé courant.
    const hasTrace = ov.originalScore !== undefined;
    return {
      ...c,
      score: clamp(Math.round(ov.score)),
      basis: note ? note : 'valeur saisie manuellement',
      overridden: true,
      originalScore: hasTrace ? ov.originalScore : c.score,
      originalBasis: hasTrace ? (ov.originalBasis ?? undefined) : c.basis,
      overrideNote: ov.note ?? null,
    };
  });
  let weighted = 0;
  let weightSum = 0;
  let evaluated = 0;
  for (const c of criteria) {
    if (c.score != null) {
      weighted += c.score * c.weight;
      weightSum += c.weight;
      evaluated += 1;
    }
  }
  return {
    ...result,
    criteria,
    global: weightSum > 0 ? Math.round(weighted / weightSum) : null,
    evaluated,
  };
}
