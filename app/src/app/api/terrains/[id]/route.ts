import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { getTerrain, TERRAIN_STATUSES, updateTerrain } from '@/modules/terrains/service';
import type { UpdateTerrainInput } from '@/modules/terrains/types';

export const runtime = 'nodejs';

// Bornes serveur (jamais confiance au client). prixDemande est un DECIMAL(12,2).
const PRIX_MAX = 9_999_999_999.99;
const LABEL_MAX_LEN = 200;
const ADDRESS_MAX_LEN = 300;
const LINK_MAX_LEN = 2000;
const NOTES_MAX_LEN = 5000;

/** Erreur de validation d'entrée (mappée en 400). */
class BadInputError extends Error {}

// GET /api/terrains/[id] : fiche d'un terrain de l'organisation.
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
  return NextResponse.json({ terrain });
}

// PATCH /api/terrains/[id] : modifie les champs manuels et le statut (US-1.9). Mise à jour
// partielle : seuls les champs présents dans le corps sont pris en compte.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'corps JSON invalide' }, { status: 400 });
  }

  let input: UpdateTerrainInput;
  try {
    input = parseUpdateInput(body);
  } catch (e) {
    const message = e instanceof BadInputError ? e.message : 'entrée invalide';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const terrain = await updateTerrain(session.user.orgId, id, input);
  if (!terrain) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }
  return NextResponse.json({ terrain });
}

/** Valide et borne l'entrée de modification. Ne retient que les champs réellement fournis. */
function parseUpdateInput(body: unknown): UpdateTerrainInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadInputError('corps JSON invalide');
  }
  const b = body as Record<string, unknown>;
  const out: UpdateTerrainInput = {};

  if ('label' in b) {
    if (typeof b.label !== 'string' || !b.label.trim()) throw new BadInputError('libellé invalide');
    out.label = b.label.trim().slice(0, LABEL_MAX_LEN);
  }
  if ('address' in b) {
    if (typeof b.address !== 'string' || !b.address.trim()) throw new BadInputError('adresse invalide');
    out.address = b.address.trim().slice(0, ADDRESS_MAX_LEN);
  }
  if ('status' in b) {
    if (typeof b.status !== 'string' || !(TERRAIN_STATUSES as readonly string[]).includes(b.status)) {
      throw new BadInputError('statut invalide');
    }
    out.status = b.status;
  }
  if ('prixDemande' in b) {
    const v = b.prixDemande;
    if (v === null) {
      out.prixDemande = null;
    } else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= PRIX_MAX) {
      out.prixDemande = Math.round(v * 100) / 100;
    } else {
      throw new BadInputError('prix demandé invalide');
    }
  }
  if ('lienAnnonce' in b) {
    const v = b.lienAnnonce;
    if (v === null) out.lienAnnonce = null;
    else if (typeof v === 'string') out.lienAnnonce = v.trim() ? v.trim().slice(0, LINK_MAX_LEN) : null;
    else throw new BadInputError('lien invalide');
  }
  if ('notes' in b) {
    const v = b.notes;
    if (v === null) out.notes = null;
    else if (typeof v === 'string') out.notes = v.trim() ? v.trim().slice(0, NOTES_MAX_LEN) : null;
    else throw new BadInputError('notes invalides');
  }

  return out;
}
