import { describe, expect, it } from 'vitest';
import { scoreTerrain, type ScoringInput } from '@/modules/terrains/scoring';
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
