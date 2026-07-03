import { bboxAround, type Bbox } from './batiment';

// Garde-fous partagés des endpoints géo par bbox (/api/buildings, /api/vegetation) : validation
// des coordonnées et arrondi (borne le cache). La limite de débit par organisation est désormais
// générique (lib/rate-limit) et partagée avec les autres endpoints coûteux ; on la ré-exporte ici
// pour ne pas casser les imports existants des routes géo.
export { withinOrgRateLimit } from '../rate-limit';

const DEFAULT_RADIUS_M = 250;
const MAX_RADIUS_M = 500;
// Arrondi des coordonnées à 3 décimales (~110 m) : borne l'espace de clés de cache et rend le
// cache efficace pour un voisinage (décalage < 60 m, négligeable pour un rayon de 250 m).
const GRID = 1000;

/** Parse et VALIDE une coordonnée : absente/vide/non finie/hors bornes => null ; sinon arrondie. */
function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * GRID) / GRID;
}

/** Parse une requête bbox géo (lon/lat/radius). Latitude bornée à ±85° (bbox dégénérée aux pôles). */
export function parseGeoBbox(url: URL): { bbox: Bbox; radiusM: number } | null {
  const lon = parseCoord(url.searchParams.get('lon'), -180, 180);
  const lat = parseCoord(url.searchParams.get('lat'), -85, 85);
  if (lon == null || lat == null) return null;
  const radiusRaw = Number(url.searchParams.get('radius'));
  const radiusM = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, MAX_RADIUS_M) : DEFAULT_RADIUS_M;
  return { bbox: bboxAround(lon, lat, radiusM), radiusM };
}
