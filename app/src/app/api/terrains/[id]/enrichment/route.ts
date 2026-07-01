import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { getTerrain, getTerrainEnrichment } from '@/modules/terrains/service';

export const runtime = 'nodejs';

// GET /api/terrains/[id]/enrichment : état des blocs d'enrichissement, interrogé par le
// polling client tant que `anyPending` est vrai. Scopé au tenant (RLS via orgId).
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
  const enrichment = await getTerrainEnrichment(session.user.orgId, id);
  return NextResponse.json(enrichment);
}
