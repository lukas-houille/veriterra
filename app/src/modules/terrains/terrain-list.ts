// Logique pure de recherche et de tri de la liste des terrains (US-5.9), testable sans UI.
// Règle 3 : un terrain sans prix n'est jamais trié comme 0 ; il reste listé mais renvoyé en fin
// de tri par prix (valeur manquante = indisponible, pas une valeur par défaut silencieuse).

export interface TerrainListItem {
  id: string;
  label: string;
  address: string;
  status: string;
  prixDemande: number | null;
  surfaceTotaleM2: number;
  createdAt: string; // ISO 8601
  /** Score global 0-100, ou null si pas encore évalué (jamais 0 par défaut, règle 3). */
  score?: number | null;
  /** Nombre d'alertes rouges. */
  redFlags?: number;
  /** Communes couvertes par les parcelles (un terrain multi-parcelles peut en couvrir plusieurs). */
  communes?: string[];
}

/** Filtres avancés du tableau comparatif (US-3.3). Un filtre vide/absent ne restreint pas. */
export interface AdvancedFilters {
  /** Statuts retenus (OU entre eux). Vide => tous. */
  statuses?: string[];
  /** Communes retenues (un terrain passe si UNE de ses communes est retenue). Vide => toutes. */
  communes?: string[];
  /** Bornes de prix demandé (incluses). Un terrain sans prix est exclu dès qu'une borne est posée. */
  prixMin?: number | null;
  prixMax?: number | null;
}

export type TerrainSortKey = 'recent' | 'label' | 'score' | 'surface' | 'prixTotal' | 'prixM2';
export type SortDirection = 'asc' | 'desc';

/** Prix au m² dérivé, ou null si prix absent ou surface nulle (jamais 0 par défaut). */
export function prixM2(item: Pick<TerrainListItem, 'prixDemande' | 'surfaceTotaleM2'>): number | null {
  return item.prixDemande != null && item.surfaceTotaleM2 > 0
    ? item.prixDemande / item.surfaceTotaleM2
    : null;
}

/** Normalise pour une recherche insensible à la casse et aux accents (tolère null/undefined). */
function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Filtre par texte libre sur le libellé et l'adresse (insensible casse/accents). */
export function filterTerrains<T extends Pick<TerrainListItem, 'label' | 'address'>>(
  items: T[],
  query: string,
): T[] {
  const q = normalize(query);
  if (q === '') return items;
  return items.filter((t) => normalize(t.label).includes(q) || normalize(t.address).includes(q));
}

/**
 * Filtre avancé (US-3.3) : statut, commune, fourchette de prix. Chaque filtre actif réduit par ET ;
 * un filtre vide n'a aucun effet. Règle 3 : un terrain sans prix demandé est EXCLU dès qu'une borne
 * de prix est posée (jamais assimilé à 0), et non silencieusement gardé. Fonction pure et testable.
 */
export function filterAdvanced<T extends Pick<TerrainListItem, 'status' | 'prixDemande' | 'communes'>>(
  items: T[],
  f: AdvancedFilters,
): T[] {
  const statuses = f.statuses && f.statuses.length > 0 ? new Set(f.statuses) : null;
  const communes = f.communes && f.communes.length > 0 ? new Set(f.communes) : null;
  const hasPrixBound = f.prixMin != null || f.prixMax != null;
  return items.filter((t) => {
    if (statuses && !statuses.has(t.status)) return false;
    if (communes) {
      const cs = t.communes ?? [];
      if (!cs.some((c) => communes.has(c))) return false;
    }
    if (hasPrixBound) {
      if (t.prixDemande == null) return false; // règle 3 : indisponible n'est pas 0
      if (f.prixMin != null && t.prixDemande < f.prixMin) return false;
      if (f.prixMax != null && t.prixDemande > f.prixMax) return false;
    }
    return true;
  });
}

/**
 * Trie une copie des terrains selon la clé et la direction demandées (défaut décroissant :
 * plus grand ou plus récent d'abord). Les valeurs manquantes (prix, score absents) sont
 * TOUJOURS renvoyées en fin, dans les deux directions, jamais assimilées à 0 (règle 3).
 * Départage stable par libellé pour un rendu déterministe.
 */
export function sortTerrains<T extends TerrainListItem>(
  items: T[],
  key: TerrainSortKey,
  direction: SortDirection = 'desc',
): T[] {
  const byLabel = (a: T, b: T) => a.label.localeCompare(b.label, 'fr');
  const sign = direction === 'asc' ? -1 : 1;
  // Compare deux nombres éventuellement nuls : nulls TOUJOURS en fin (indépendamment de la
  // direction), sinon ordonnés selon la direction (desc = plus grand d'abord).
  const cmpNum = (a: number | null, b: number | null, x: T, y: T): number => {
    if (a == null && b == null) return byLabel(x, y);
    if (a == null) return 1;
    if (b == null) return -1;
    return sign * (b - a) || byLabel(x, y);
  };
  const copy = [...items];
  switch (key) {
    case 'label':
      // Alphabétique : asc = A vers Z, desc = Z vers A.
      return copy.sort((a, b) => (direction === 'asc' ? byLabel(a, b) : -byLabel(a, b)));
    case 'score':
      // Score le plus haut d'abord (desc) ; non évalués (null) en fin dans les deux sens.
      return copy.sort((a, b) => cmpNum(a.score ?? null, b.score ?? null, a, b));
    case 'surface':
      return copy.sort((a, b) => cmpNum(a.surfaceTotaleM2, b.surfaceTotaleM2, a, b));
    case 'prixTotal':
      return copy.sort((a, b) => cmpNum(a.prixDemande, b.prixDemande, a, b));
    case 'prixM2':
      return copy.sort((a, b) => cmpNum(prixM2(a), prixM2(b), a, b));
    case 'recent':
    default:
      // Par date de création : desc = plus récent d'abord, asc = plus ancien d'abord.
      return copy.sort((a, b) => {
        if (a.createdAt === b.createdAt) return byLabel(a, b);
        return sign * (a.createdAt < b.createdAt ? 1 : -1);
      });
  }
}
