import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  CRITERION_KEYS,
  isCriterionKey,
  scoreTerrain,
  type CriterionKey,
  type CriterionOverride,
  type ScoringInput,
} from '@/modules/terrains/scoring';
import type { PenteData, PluData, PrixDvfData, RisquesData, ServicesData } from '@veriterra/enrichment';

const base: ScoringInput = {
  prixDemande: null,
  surfaceTotaleM2: 500,
  budgetMax: null,
  surfaceMinM2: null,
  surfaceMaxM2: null,
};

function crit(input: Partial<ScoringInput>, key: string): number | null {
  const c = scoreTerrain({ ...base, ...input }).criteria.find((x) => x.key === key);
  return c?.score ?? null;
}

const risques = (severities: Array<'danger' | 'warning' | 'info' | 'success'>): RisquesData => ({
  items: severities.map((s, i) => ({
    key: (['argile', 'inondation', 'radon', 'sismicite'] as const)[i] ?? 'argile',
    label: 'x',
    value: 'x',
    severity: s,
    available: true,
    source: 'Géorisques',
    sourceUrl: 'x',
  })),
});
const pente = (pentePct: number | null, expositionLabel: string | null): PenteData => ({
  altitudeM: 200,
  pentePct,
  penteDeg: null,
  expositionLabel,
  expositionBearingDeg: null,
  note: null,
});
const services = (nearest: Array<number | null>): ServicesData => ({
  radiusM: 1500,
  items: (['ecoles', 'commerces', 'transports'] as const).map((key, i) => ({
    key,
    label: key,
    nearestM: nearest[i] ?? null,
    count: nearest[i] != null ? 1 : 0,
  })),
  note: null,
});
const plu = (typezone: string | null): PluData => ({
  typezone,
  zoneLibelle: typezone,
  zoneDescription: null,
  documentType: 'PLU',
  documentName: 'x',
  dateValidite: null,
  reglementUrl: null,
  isRnu: false,
  note: typezone ? null : 'RNU',
});
const dvf = (estimationM2: number | null): PrixDvfData => ({
  estimationM2,
  fourchetteBasseM2: null,
  fourchetteHauteM2: null,
  nbComparables: estimationM2 == null ? 0 : 5,
  dernieresVentes: [],
  note: estimationM2 == null ? 'comparables insuffisants' : null,
});

describe('critères', () => {
  it('prix : au marché ~70, sous le marché plus haut, au-dessus plus bas, budget pénalise', () => {
    // est 200 €/m² x 500 m² = 100 000.
    expect(crit({ prixDemande: 100000, prixDvf: dvf(200) }, 'prix')).toBe(70);
    expect(crit({ prixDemande: 70000, prixDvf: dvf(200) }, 'prix')).toBe(100); // -30 %
    expect(crit({ prixDemande: 130000, prixDvf: dvf(200) }, 'prix')).toBe(40); // +30 %
    expect(crit({ prixDemande: 130000, budgetMax: 120000, prixDvf: dvf(200) }, 'prix')).toBe(20); // +budget
    expect(crit({ prixDemande: null, prixDvf: dvf(200) }, 'prix')).toBeNull();
    expect(crit({ prixDemande: 100000, prixDvf: dvf(null) }, 'prix')).toBeNull(); // hors DVF
  });
  it('constructibilité : U haut, AU moyen, A/N bas', () => {
    expect(crit({ plu: plu('U') }, 'constructibilite')).toBe(90);
    expect(crit({ plu: plu('AU') }, 'constructibilite')).toBe(65);
    expect(crit({ plu: plu('A') }, 'constructibilite')).toBe(15);
    expect(crit({ plu: plu('N') }, 'constructibilite')).toBe(12);
    expect(crit({ plu: plu(null) }, 'constructibilite')).toBeNull();
  });
  it('risques : baisse selon les sévérités', () => {
    expect(crit({ risques: risques(['success', 'success', 'info', 'success']) }, 'georisques')).toBe(100);
    expect(crit({ risques: risques(['danger', 'success', 'info', 'success']) }, 'georisques')).toBe(65);
    expect(crit({ risques: risques(['danger', 'warning', 'info', 'success']) }, 'georisques')).toBe(50);
  });
  it('ensoleillement : proxy exposition (Sud haut, Nord bas, plat neutre)', () => {
    expect(crit({ pente: pente(5, 'Sud') }, 'ensoleillement')).toBe(95);
    expect(crit({ pente: pente(5, 'Nord') }, 'ensoleillement')).toBe(28);
    expect(crit({ pente: pente(1, null) }, 'ensoleillement')).toBe(70);
    expect(crit({ pente: pente(null, null) }, 'ensoleillement')).toBeNull();
  });
  it('pente : plat haut, raide bas', () => {
    expect(crit({ pente: pente(2, 'Sud') }, 'pente')).toBe(95);
    expect(crit({ pente: pente(10, 'Sud') }, 'pente')).toBe(62);
    expect(crit({ pente: pente(25, 'Sud') }, 'pente')).toBe(15);
  });
  it('services : proche haut', () => {
    expect(crit({ services: services([200, 200, 200]) }, 'services')).toBe(100);
    expect(crit({ services: services([null, null, null]) }, 'services')).toBe(15);
  });
  it('trajet et tension : toujours non évalués (pas de source)', () => {
    expect(crit({ prixDemande: 100000, prixDvf: dvf(200) }, 'trajet')).toBeNull();
    expect(crit({ prixDemande: 100000, prixDvf: dvf(200) }, 'tension')).toBeNull();
  });
});

describe('global + renormalisation', () => {
  it('global null quand rien n\'est évalué (jamais 0)', () => {
    const r = scoreTerrain(base);
    expect(r.global).toBeNull();
    expect(r.evaluated).toBe(0);
    expect(r.criteria.every((c) => c.score === null)).toBe(true);
  });
  it('un seul critère évalué => global = ce score (poids renormalisé)', () => {
    const r = scoreTerrain({ ...base, plu: plu('U') });
    expect(r.global).toBe(90);
    expect(r.evaluated).toBe(1);
  });
  it('moyenne pondérée sur les critères évalués', () => {
    // pente 95 (poids 10) + services 100 (poids 10) => (95+100)/2 = 97.5 -> 98.
    const r = scoreTerrain({ ...base, pente: pente(2, 'Sud'), services: services([100, 100, 100]) });
    // pente(2,'Sud') évalue AUSSI ensoleillement (95, poids 15). (95*10 + 100*10 + 95*15)/(35) = 96.4 -> 96.
    expect(r.global).toBe(96);
    expect(r.evaluated).toBe(3);
  });
});

describe('alertes rouges', () => {
  it('non constructible (A/N), inondable, hors DVF', () => {
    expect(scoreTerrain({ ...base, plu: plu('A') }).redFlags.map((f) => f.key)).toContain('non_constructible');
    expect(scoreTerrain({ ...base, plu: plu('AU') }).redFlags.map((f) => f.key)).not.toContain('non_constructible');
    expect(scoreTerrain({ ...base, risques: risques(['success', 'warning', 'info', 'success']) }).redFlags.map((f) => f.key)).toContain('inondable');
    expect(scoreTerrain({ ...base, prixDemande: 100000, prixDvf: dvf(null) }).redFlags.map((f) => f.key)).toContain('hors_dvf');
  });
  it('les alertes n\'annulent pas le score (le terrain reste noté)', () => {
    const r = scoreTerrain({ ...base, plu: plu('N') });
    expect(r.redFlags.length).toBeGreaterThan(0);
    expect(r.global).toBe(12); // noté malgré l'alerte, jamais exclu
  });
});

describe('overrides manuels (US-3.1)', () => {
  const ov = (score: number, note?: string): CriterionOverride => ({ score, note });

  it('CRITERION_KEYS couvre les 8 critères et isCriterionKey garde la validation', () => {
    expect(CRITERION_KEYS).toHaveLength(8);
    expect(CRITERION_KEYS).toContain('prix');
    expect(isCriterionKey('prix')).toBe(true);
    expect(isCriterionKey('inconnu')).toBe(false);
  });

  it('sans override, le résultat est inchangé (référence identique)', () => {
    const r = scoreTerrain({ ...base, plu: plu('U') });
    expect(applyOverrides(r, new Map())).toBe(r);
  });

  it('override remplace la note d\'un critère et re-renormalise le global', () => {
    // Base : PLU U (constructibilite 90, poids 15) seul évalué => global 90.
    const r = scoreTerrain({ ...base, plu: plu('U') });
    expect(r.global).toBe(90);
    // On force constructibilite à 50.
    const o = applyOverrides(r, new Map<CriterionKey, CriterionOverride>([['constructibilite', ov(50)]]));
    const c = o.criteria.find((x) => x.key === 'constructibilite')!;
    expect(c.score).toBe(50);
    expect(c.overridden).toBe(true);
    expect(c.originalScore).toBe(90); // trace de la valeur dérivée d'origine
    expect(o.global).toBe(50);
    expect(r.global).toBe(90); // l'entrée n'est pas mutée
  });

  it('override d\'un critère non évalué (trajet) l\'intègre au global, origine tracée à null', () => {
    // Base : PLU U (90, poids 15) + on note trajet (poids 10) à 100.
    const r = scoreTerrain({ ...base, plu: plu('U') });
    expect(r.evaluated).toBe(1);
    const o = applyOverrides(r, new Map<CriterionKey, CriterionOverride>([['trajet', ov(100, 'à 10 min')]]));
    const t = o.criteria.find((x) => x.key === 'trajet')!;
    expect(t.score).toBe(100);
    expect(t.overridden).toBe(true);
    expect(t.originalScore).toBeNull(); // jamais un 0 fabriqué (règle 3)
    expect(t.basis).toBe('à 10 min'); // la note devient la base affichée
    expect(o.evaluated).toBe(2);
    // (90*15 + 100*10) / 25 = 94.
    expect(o.global).toBe(94);
  });

  it('la note manuelle est bornée 0-100 et arrondie', () => {
    const r = scoreTerrain({ ...base, plu: plu('U') });
    const hi = applyOverrides(r, new Map<CriterionKey, CriterionOverride>([['constructibilite', ov(150)]]));
    expect(hi.criteria.find((x) => x.key === 'constructibilite')!.score).toBe(100);
    const lo = applyOverrides(r, new Map<CriterionKey, CriterionOverride>([['constructibilite', ov(-10)]]));
    expect(lo.criteria.find((x) => x.key === 'constructibilite')!.score).toBe(0);
    const rounded = applyOverrides(r, new Map<CriterionKey, CriterionOverride>([['constructibilite', ov(72.6)]]));
    expect(rounded.criteria.find((x) => x.key === 'constructibilite')!.score).toBe(73);
  });

  it('sans note, la base indique une saisie manuelle', () => {
    const r = scoreTerrain({ ...base, plu: plu('U') });
    const o = applyOverrides(r, new Map<CriterionKey, CriterionOverride>([['constructibilite', ov(50)]]));
    expect(o.criteria.find((x) => x.key === 'constructibilite')!.basis).toBe('valeur saisie manuellement');
  });

  it('overrideNote expose la note brute pour la ré-édition', () => {
    const r = scoreTerrain({ ...base, plu: plu('U') });
    const o = applyOverrides(r, new Map<CriterionKey, CriterionOverride>([['constructibilite', ov(50, 'ma justif')]]));
    expect(o.criteria.find((x) => x.key === 'constructibilite')!.overrideNote).toBe('ma justif');
  });

  it('la trace d\'origine FIGÉE est préférée à la valeur dérivée courante (règle 1)', () => {
    // Dérivé courant : PLU U => constructibilite 90. Mais l'override porte une trace figée à 40.
    const r = scoreTerrain({ ...base, plu: plu('U') });
    const o = applyOverrides(
      r,
      new Map<CriterionKey, CriterionOverride>([
        ['constructibilite', { score: 55, originalScore: 40, originalBasis: 'zone à urbaniser (à la pose)' }],
      ]),
    );
    const c = o.criteria.find((x) => x.key === 'constructibilite')!;
    expect(c.originalScore).toBe(40); // figée, PAS 90 (dérivé courant)
    expect(c.originalBasis).toBe('zone à urbaniser (à la pose)');
  });

  it('trace figée à null (critère non évalué à l\'origine) reste null même si le dérivé courant existe', () => {
    const r = scoreTerrain({ ...base, plu: plu('U') }); // constructibilite dérivée = 90
    const o = applyOverrides(
      r,
      new Map<CriterionKey, CriterionOverride>([
        ['constructibilite', { score: 55, originalScore: null, originalBasis: null }],
      ]),
    );
    expect(o.criteria.find((x) => x.key === 'constructibilite')!.originalScore).toBeNull(); // figée à null
  });
});
