import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createTerrain, listTerrains } from '@/modules/terrains/service';
import type { CreateTerrainInput } from '@/modules/terrains/types';

export const runtime = 'nodejs';

// GET /api/terrains : liste les terrains de l'organisation (dashboard).
export async function GET() {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const terrains = await listTerrains(session.user.orgId);
  return NextResponse.json({ terrains });
}

// POST /api/terrains : crée un terrain à partir des IDU de parcelles sélectionnés.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'corps JSON invalide' }, { status: 400 });
  }

  const input = parseCreateInput(body);
  if (!input) {
    return NextResponse.json(
      { error: 'address, inseeCode et au moins une parcelle (idus) sont requis' },
      { status: 422 },
    );
  }

  try {
    const terrain = await createTerrain(session.user.orgId, session.user.id, input);
    return NextResponse.json({ terrain }, { status: 201 });
  } catch (err) {
    // Échec de récupération parcellaire (API Carto) ou de persistance.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'création impossible' },
      { status: 502 },
    );
  }
}

function parseCreateInput(body: unknown): CreateTerrainInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const address = typeof b.address === 'string' ? b.address.trim() : '';
  const inseeCode = typeof b.inseeCode === 'string' ? b.inseeCode.trim() : '';
  const idus = Array.isArray(b.idus)
    ? b.idus.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  if (!address || !inseeCode || idus.length === 0) return null;
  return {
    address,
    inseeCode,
    idus,
    label: typeof b.label === 'string' ? b.label : undefined,
    prixDemande: typeof b.prixDemande === 'number' ? b.prixDemande : null,
    lienAnnonce: typeof b.lienAnnonce === 'string' ? b.lienAnnonce : null,
    notes: typeof b.notes === 'string' ? b.notes : null,
  };
}
