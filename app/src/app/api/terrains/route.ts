import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createTerrain, listTerrains } from '@/modules/terrains/service';
import type { CreateTerrainInput, ParcelleInput } from '@/modules/terrains/types';
import type { GeoJsonGeometry } from '@/lib/geo/types';

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
      { error: 'address, inseeCode et au moins une parcelle valide sont requis' },
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
  const parcelles = Array.isArray(b.parcelles)
    ? b.parcelles.map(parseParcelle).filter((p): p is ParcelleInput => p !== null)
    : [];
  if (!address || !inseeCode || parcelles.length === 0) return null;
  return {
    address,
    inseeCode,
    parcelles,
    label: typeof b.label === 'string' ? b.label : undefined,
    prixDemande: typeof b.prixDemande === 'number' ? b.prixDemande : null,
    lienAnnonce: typeof b.lienAnnonce === 'string' ? b.lienAnnonce : null,
    notes: typeof b.notes === 'string' ? b.notes : null,
  };
}

function parseParcelle(x: unknown): ParcelleInput | null {
  if (typeof x !== 'object' || x === null) return null;
  const p = x as Record<string, unknown>;
  const geojson = p.geojson as { type?: unknown; coordinates?: unknown } | null;
  if (
    typeof p.idu !== 'string' ||
    typeof p.commune !== 'string' ||
    typeof p.section !== 'string' ||
    typeof p.numero !== 'string' ||
    typeof p.surfaceM2 !== 'number' ||
    typeof geojson !== 'object' ||
    geojson === null ||
    (geojson.type !== 'Polygon' && geojson.type !== 'MultiPolygon') ||
    !Array.isArray(geojson.coordinates)
  ) {
    return null;
  }
  return {
    idu: p.idu,
    commune: p.commune,
    section: p.section,
    numero: p.numero,
    surfaceM2: p.surfaceM2,
    geojson: geojson as GeoJsonGeometry,
  };
}
