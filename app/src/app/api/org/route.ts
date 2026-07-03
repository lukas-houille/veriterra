import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { renameOrganisation } from '@/modules/organisation/service';

export const runtime = 'nodejs';

// PATCH /api/org : renomme l'organisation courante. Réservé aux OWNER/ADMIN. L'organisation ciblée
// est TOUJOURS celle de la session (jamais un id fourni par le client), donc pas d'accès inter-org.
export async function PATCH(req: Request) {
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
  const name = (body as { name?: unknown })?.name;
  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Nom d\'organisation requis.' }, { status: 400 });
  }

  const updated = await renameOrganisation(session.user.orgId, name);
  return NextResponse.json({ name: updated });
}
