import { NextResponse } from 'next/server';
import { getRedisConnection } from '@veriterra/shared';
import { auth } from '@/auth';
import { bboxAround, fetchBatimentsBbox } from '@/lib/geo/batiment';

export const runtime = 'nodejs';

const DEFAULT_RADIUS_M = 250;
const MAX_RADIUS_M = 500;
// Arrondi des coordonnées à 3 décimales (~110 m) : borne l'espace de clés de cache et rend le
// cache efficace pour un voisinage, de sorte qu'itérer des coordonnées fines n'amplifie ni les
// requêtes WFS ni les écritures Redis (décalage < 60 m, négligeable pour un rayon de 250 m).
const GRID = 1000;
const RATE_LIMIT = 40; // requêtes par fenêtre et par organisation
const RATE_WINDOW_S = 60;

/** Limite de débit best-effort par organisation (Redis INCR). N'échoue pas si Redis est indisponible. */
async function withinRateLimit(orgId: string): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const key = `rl:buildings:${orgId}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, RATE_WINDOW_S);
    return n <= RATE_LIMIT;
  } catch {
    return true;
  }
}

/** Parse et VALIDE une coordonnée : absente/vide/non finie/hors bornes => null ; sinon arrondie à la grille. */
function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * GRID) / GRID;
}

// GET /api/buildings?lon=&lat=&radius= : bâtiments BD TOPO (empreinte + hauteur) autour d'un point.
// Non lié à un terrain (le bâti BD TOPO est une donnée publique IGN), mais réservé aux sessions
// authentifiées et limité en débit par organisation. Réutilisé par la vue soleil de l'explorer,
// où la parcelle n'est pas encore persistée (la route scopée /api/terrains/[id]/buildings ne
// s'applique pas). Latitude bornée à ±85° pour éviter une bbox dégénérée près des pôles.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!(await withinRateLimit(session.user.orgId))) {
    return NextResponse.json({ error: 'trop de requêtes' }, { status: 429 });
  }

  const url = new URL(req.url);
  const lon = parseCoord(url.searchParams.get('lon'), -180, 180);
  const lat = parseCoord(url.searchParams.get('lat'), -85, 85);
  if (lon == null || lat == null) {
    return NextResponse.json({ error: 'coordonnées invalides' }, { status: 400 });
  }
  const radiusRaw = Number(url.searchParams.get('radius'));
  const radiusM = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, MAX_RADIUS_M) : DEFAULT_RADIUS_M;

  const { batiments, transientError } = await fetchBatimentsBbox(bboxAround(lon, lat, radiusM));
  if (transientError) {
    return NextResponse.json({ error: 'BD TOPO injoignable' }, { status: 502 });
  }
  return NextResponse.json({ batiments, radiusM });
}
