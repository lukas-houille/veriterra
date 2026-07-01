import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProjet, saveProjet } from '@/modules/projet/service';
import type { MaisonType, ProjetInput } from '@/modules/projet/types';

export const runtime = 'nodejs';

const MAISON_TYPES: MaisonType[] = ['PLAIN_PIED', 'R1', 'R2', 'R3'];

// Bornes alignées sur le schéma : budgetMax est un DECIMAL(12,2) (max 9 999 999 999,99),
// les surfaces des INTEGER. On borne côté serveur (jamais confiance au client) pour éviter
// un budget négatif et un dépassement de capacité côté Postgres (sinon 500 non maîtrisé).
const BUDGET_MAX = 9_999_999_999.99;
const SURFACE_MAX = 1_000_000_000; // 1000 km² en m², sous la limite d'un INTEGER signé.
const NAME_MAX_LEN = 120;

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
  // Entier positif borné (hors bornes ou non numérique => null, traité comme non renseigné).
  const boundedInt = (v: unknown, max: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null;
  const budgetMax =
    typeof b.budgetMax === 'number' && Number.isFinite(b.budgetMax) && b.budgetMax >= 0 && b.budgetMax <= BUDGET_MAX
      ? Math.round(b.budgetMax * 100) / 100
      : null;
  const name =
    typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, NAME_MAX_LEN) : undefined;
  const type =
    typeof b.typeMaison === 'string' && (MAISON_TYPES as string[]).includes(b.typeMaison)
      ? (b.typeMaison as MaisonType)
      : null;
  return {
    name,
    budgetMax,
    surfaceMinM2: boundedInt(b.surfaceMinM2, SURFACE_MAX),
    surfaceMaxM2: boundedInt(b.surfaceMaxM2, SURFACE_MAX),
    typeMaison: type,
    consentementPartage: typeof b.consentementPartage === 'boolean' ? b.consentementPartage : false,
  };
}
