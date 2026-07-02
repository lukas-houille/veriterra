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
