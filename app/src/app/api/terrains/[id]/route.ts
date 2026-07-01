import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTerrain } from '@/modules/terrains/service';

export const runtime = 'nodejs';

// GET /api/terrains/[id] : fiche d'un terrain de l'organisation.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  const terrain = await getTerrain(session.user.orgId, id);
  if (!terrain) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }
  return NextResponse.json({ terrain });
}
