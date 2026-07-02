import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { getTerrain } from '@/modules/terrains/service';
import { bboxAround, fetchBatimentsBbox } from '@/lib/geo/batiment';
import { parcellesCentroid } from '@/lib/geo/centroid';

export const runtime = 'nodejs';

// Rayon (m) de recherche des bâtiments voisins autour du centre de la parcelle : assez large
// pour capter les voisins qui ombrent, sans surcharger la requête WFS.
const RADIUS_M = 250;

// GET /api/terrains/[id]/buildings : bâtiments BD TOPO (empreinte + hauteur) autour de la
// parcelle, pour l'onglet Soleil. Scopé tenant (auth + getTerrain), source-side (CORS-free).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }
  const terrain = await getTerrain(session.user.orgId, id);
  if (!terrain) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }

  const centroid = parcellesCentroid(terrain.parcelles);
  if (!centroid) {
    return NextResponse.json({ batiments: [], centroid: null, radiusM: RADIUS_M });
  }

  const { batiments, transientError } = await fetchBatimentsBbox(
    bboxAround(centroid.lon, centroid.lat, RADIUS_M),
  );
  if (transientError) {
    return NextResponse.json({ error: 'BD TOPO injoignable' }, { status: 502 });
  }
  return NextResponse.json({ batiments, centroid, radiusM: RADIUS_M });
}
