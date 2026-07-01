import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProjet, saveProjet } from '@/modules/projet/service';
import type { MaisonType, ProjetInput } from '@/modules/projet/types';

export const runtime = 'nodejs';

const MAISON_TYPES: MaisonType[] = ['PLAIN_PIED', 'R1', 'R2', 'R3'];

// GET /api/projet : le projet actif de l'organisation (ou null).
export async function GET() {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const projet = await getActiveProjet(session.user.orgId);
  return NextResponse.json({ projet });
}

// POST /api/projet : crée ou met à jour le projet (onboarding et édition).
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

  const projet = await saveProjet(session.user.orgId, parseProjetInput(body));
  return NextResponse.json({ projet });
}

function parseProjetInput(body: unknown): ProjetInput {
  if (typeof body !== 'object' || body === null) return {};
  const b = body as Record<string, unknown>;
  const posInt = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  const type =
    typeof b.typeMaison === 'string' && (MAISON_TYPES as string[]).includes(b.typeMaison)
      ? (b.typeMaison as MaisonType)
      : null;
  return {
    name: typeof b.name === 'string' ? b.name : undefined,
    budgetMax: typeof b.budgetMax === 'number' && Number.isFinite(b.budgetMax) ? b.budgetMax : null,
    surfaceMinM2: posInt(b.surfaceMinM2),
    surfaceMaxM2: posInt(b.surfaceMaxM2),
    typeMaison: type,
    consentementPartage: typeof b.consentementPartage === 'boolean' ? b.consentementPartage : false,
  };
}
