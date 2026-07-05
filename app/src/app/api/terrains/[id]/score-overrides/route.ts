import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { clearScoreOverride, setScoreOverride } from '@/modules/terrains/service';
import { isCriterionKey, type CriterionKey } from '@/modules/terrains/scoring';

export const runtime = 'nodejs';

// Bornes serveur (jamais confiance au client).
const NOTE_MAX_LEN = 500;

/** Erreur de validation d'entrée (mappée en 400). */
class BadInputError extends Error {}

// PUT /api/terrains/[id]/score-overrides : pose ou met à jour l'override manuel d'un critère (US-3.1).
// Corps : { criterion: CriterionKey, score: 0-100, note?: string }. Le score global est recalculé
// (re-renormalisé) à la lecture ; la valeur d'origine est tracée côté service.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let criterion: CriterionKey;
  let score: number;
  let note: string | null;
  try {
    const b = body as Record<string, unknown>;
    if (typeof b.criterion !== 'string' || !isCriterionKey(b.criterion)) {
      throw new BadInputError('critère inconnu');
    }
    criterion = b.criterion;
    if (typeof b.score !== 'number' || !Number.isFinite(b.score) || b.score < 0 || b.score > 100) {
      throw new BadInputError('note attendue entre 0 et 100');
    }
    score = b.score;
    if (b.note === undefined || b.note === null) {
      note = null;
    } else if (typeof b.note === 'string') {
      if (b.note.length > NOTE_MAX_LEN) throw new BadInputError('justification trop longue');
      note = b.note;
    } else {
      throw new BadInputError('justification invalide');
    }
  } catch (e) {
    const message = e instanceof BadInputError ? e.message : 'entrée invalide';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const ok = await setScoreOverride(session.user.orgId, id, criterion, score, note, session.user.id);
  if (!ok) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/terrains/[id]/score-overrides?criterion=... : retire l'override d'un critère (retour
// au score dérivé). Le critère est passé en query (pas de corps sur un DELETE).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }

  const criterion = new URL(req.url).searchParams.get('criterion');
  if (!criterion || !isCriterionKey(criterion)) {
    return NextResponse.json({ error: 'critère inconnu' }, { status: 400 });
  }

  const ok = await clearScoreOverride(session.user.orgId, id, criterion);
  if (!ok) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
