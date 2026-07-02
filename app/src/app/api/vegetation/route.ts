import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { parseGeoBbox, withinOrgRateLimit } from '@/lib/geo/bbox-request';
import { fetchVegetationBbox } from '@/lib/geo/vegetation';

export const runtime = 'nodejs';

// GET /api/vegetation?lon=&lat=&radius= : emprises boisées OSM (canopée approximée) autour d'un
// point, pour l'analyse d'ensoleillement (la végétation projette une ombre plausible). Donnée
// publique OSM, non liée à un terrain, mais réservée aux sessions authentifiées et durcie contre
// l'amplification (débit + coordonnées arrondies + bornes) via les gardes partagés de bbox-request.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!(await withinOrgRateLimit(session.user.orgId, 'vegetation'))) {
    return NextResponse.json({ error: 'trop de requêtes' }, { status: 429 });
  }
  const geo = parseGeoBbox(new URL(req.url));
  if (!geo) {
    return NextResponse.json({ error: 'coordonnées invalides' }, { status: 400 });
  }

  const { canopees, transientError } = await fetchVegetationBbox(geo.bbox);
  if (transientError) {
    return NextResponse.json({ error: 'Végétation OSM injoignable' }, { status: 502 });
  }
  return NextResponse.json({ canopees, radiusM: geo.radiusM });
}
