import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  changeMemberRole,
  OrgManageError,
  removeMember,
  type OrgRole,
} from '@/modules/organisation/service';

export const runtime = 'nodejs';

// Gestion d'un membre de l'organisation COURANTE. Réservé aux OWNER/ADMIN ; les invariants fins
// (seul un OWNER gère un OWNER, jamais retirer le dernier OWNER) sont vérifiés dans le service. Le
// membre ciblé est toujours résolu dans l'organisation de la session (RLS), pas d'accès inter-org.

function manageError(e: unknown): NextResponse | null {
  if (e instanceof OrgManageError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

// PATCH /api/org/members/[userId] : change le rôle d'un membre.
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux administrateurs de l\'organisation.' }, { status: 403 });
  }
  const { userId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const role = (body as { role?: unknown })?.role;
  if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'MEMBER') {
    return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 });
  }

  try {
    await changeMemberRole(session.user.orgId, session.user.role as OrgRole, userId, role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mapped = manageError(e);
    if (mapped) return mapped;
    throw e;
  }
}

// DELETE /api/org/members/[userId] : retire un membre de l'organisation.
export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux administrateurs de l\'organisation.' }, { status: 403 });
  }
  const { userId } = await params;

  try {
    await removeMember(session.user.orgId, session.user.role as OrgRole, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mapped = manageError(e);
    if (mapped) return mapped;
    throw e;
  }
}
