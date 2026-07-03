import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { withinOrgRateLimit } from '@/lib/rate-limit';
import { enqueueTerrainEnrichment, getTerrain } from '@/modules/terrains/service';

export const runtime = 'nodejs';

// Rafraîchissement forcé très coûteux (fan-out vers 5 sources externes DVF/Géorisques/IGN/GPU/Overpass
// + job worker, cache contourné) : limite stricte par organisation pour éviter qu'un membre sature la
// file partagée (DoS de l'enrichissement de tous les tenants) et fasse bannir l'IP serveur des sources.
const ENRICH_RATE_LIMIT = 10; // par minute et par organisation

// POST /api/terrains/[id]/enrich : (ré)enfile l'enrichissement du terrain (rafraîchissement
// global, force = contournement du cache). Le rendu par bloc se met à jour par polling client.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!(await withinOrgRateLimit(session.user.orgId, 'enrich', ENRICH_RATE_LIMIT))) {
    return NextResponse.json(
      { error: 'Trop de rafraîchissements, réessayez dans un instant.' },
      { status: 429 },
    );
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
