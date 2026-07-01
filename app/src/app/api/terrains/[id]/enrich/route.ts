import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { enqueueTerrainEnrichment, getTerrain } from '@/modules/terrains/service';

export const runtime = 'nodejs';

// POST /api/terrains/[id]/enrich : (ré)enfile l'enrichissement du terrain (rafraîchissement
// global, force = contournement du cache). Le rendu par bloc se met à jour par polling client.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }
  // Vérifie l'existence dans le tenant avant d'enfiler (évite d'enfiler pour un id inconnu).
  const terrain = await getTerrain(session.user.orgId, id);
  if (!terrain) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }
  await enqueueTerrainEnrichment(session.user.orgId, id, { force: true });
  return NextResponse.json({ status: 'queued' }, { status: 202 });
}
