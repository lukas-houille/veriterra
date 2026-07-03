import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { OrgManageError, revokeInvitation } from '@/modules/organisation/service';

export const runtime = 'nodejs';

// DELETE /api/org/invitations/[id] : révoque une invitation en attente. Réservé aux OWNER/ADMIN.
// L'invitation est résolue dans l'organisation de la session (RLS), donc pas d'accès inter-org.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux administrateurs de l\'organisation.' }, { status: 403 });
  }
  const { id } = await params;

  try {
    await revokeInvitation(session.user.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OrgManageError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
