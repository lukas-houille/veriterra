import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { createDocument, listDocuments } from '@/modules/terrains/documents';
import { maxUploadBytes } from '@/lib/storage/s3';
import { getTerrain } from '@/modules/terrains/service';

export const runtime = 'nodejs';

// Codes de refus de validation (documents.ts / validate.ts) vers statut HTTP.
const CODE_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  EMPTY: 400,
  TYPE: 415,
  SIZE: 413,
  CONTENT: 400,
};

// GET /api/terrains/[id]/documents : liste des pièces jointes (la fiche lit aussi le service
// directement en composant serveur ; cette route sert l'îlot client après upload/suppression).
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
  const documents = await listDocuments(session.user.orgId, id);
  return NextResponse.json({ documents });
}

// POST /api/terrains/[id]/documents : dépose une pièce (multipart : file, label?, docType?).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let maxBytes: number;
  try {
    maxBytes = maxUploadBytes();
  } catch {
    return NextResponse.json({ error: 'Stockage de documents indisponible.' }, { status: 503 });
  }

  // Garde anti-DoS : refuse tôt sur l'en-tête Content-Length (marge pour l'overhead multipart),
  // avant de bufferiser le corps.
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes + 1_000_000) {
    return NextResponse.json({ error: 'Fichier trop volumineux.' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'corps multipart invalide' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'fichier manquant' }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: 'Fichier trop volumineux.' }, { status: 413 });
  }

  const labelRaw = form.get('label');
  const docTypeRaw = form.get('docType');
  const bytes = Buffer.from(await file.arrayBuffer());

  const result = await createDocument(session.user.orgId, id, session.user.id ?? null, {
    file: { filename: file.name, contentType: file.type, bytes },
    label: typeof labelRaw === 'string' ? labelRaw : null,
    docType: typeof docTypeRaw === 'string' ? docTypeRaw : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: CODE_STATUS[result.code] ?? 400 });
  }
  return NextResponse.json({ document: result.document }, { status: 201 });
}
