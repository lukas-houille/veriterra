import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { inviteMember, OrgManageError, type OrgRole } from '@/modules/organisation/service';

export const runtime = 'nodejs';

// POST /api/org/invitations : invite un e-mail à rejoindre l'organisation courante. Réservé aux
// OWNER/ADMIN. L'organisation ciblée est TOUJOURS celle de la session (jamais un id fourni par le
// client), donc pas d'accès inter-organisation.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux administrateurs de l\'organisation.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const email = (body as { email?: unknown })?.email;
  const role = (body as { role?: unknown })?.role;
  if (typeof email !== 'string' || email.trim() === '') {
    return NextResponse.json({ error: 'Adresse e-mail requise.' }, { status: 400 });
  }
  const inviteRole: OrgRole = role === 'ADMIN' ? 'ADMIN' : 'MEMBER';

  try {
    const invitation = await inviteMember(session.user.orgId, session.user.id, email, inviteRole);
    return NextResponse.json({ invitation });
  } catch (e) {
    if (e instanceof OrgManageError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
