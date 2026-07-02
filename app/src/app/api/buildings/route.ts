import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchBatimentsBbox } from '@/lib/geo/batiment';
import { parseGeoBbox, withinOrgRateLimit } from '@/lib/geo/bbox-request';

export const runtime = 'nodejs';

// GET /api/buildings?lon=&lat=&radius= : bâtiments BD TOPO (empreinte + hauteur) autour d'un point.
// Non lié à un terrain (le bâti BD TOPO est une donnée publique IGN), mais réservé aux sessions
// authentifiées et durci contre l'amplification (débit par organisation + coordonnées arrondies +
// bornes) via les gardes partagés de bbox-request. Réutilisé par l'analyse d'ensoleillement.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!(await withinOrgRateLimit(session.user.orgId, 'buildings'))) {
    return NextResponse.json({ error: 'trop de requêtes' }, { status: 429 });
  }
  const geo = parseGeoBbox(new URL(req.url));
  if (!geo) {
    return NextResponse.json({ error: 'coordonnées invalides' }, { status: 400 });
  }

  const { batiments, transientError } = await fetchBatimentsBbox(geo.bbox);
  if (transientError) {
    return NextResponse.json({ error: 'BD TOPO injoignable' }, { status: 502 });
  }
  return NextResponse.json({ batiments, radiusM: geo.radiusM });
}
