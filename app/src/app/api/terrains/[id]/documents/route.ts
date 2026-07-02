import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { readCappedBody } from '@/lib/http';
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

// GET /api/terrains/[id]/documents : liste des pièces jointes via l'API. Complément : la fiche
// lit le service directement en composant serveur et l'îlot client rafraîchit via router.refresh().
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

  // Garde anti-DoS. Le Content-Length permet un refus immédiat, mais il peut être absent
  // (chunked, HTTP/2), donc la borne AUTORITAIRE est la lecture bornée du flux ci-dessous :
  // on ne bufferise jamais au-delà de la limite (+ marge pour l'overhead multipart).
  const cap = maxBytes + 1_000_000;
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > cap) {
    return NextResponse.json({ error: 'Fichier trop volumineux.' }, { status: 413 });
  }

  const raw = await readCappedBody(req, cap);
  if (raw === null) {
    return NextResponse.json({ error: 'Fichier trop volumineux.' }, { status: 413 });
  }

  // Parse le multipart depuis le corps déjà borné (l'en-tête Content-Type porte la frontière).
  let form: FormData;
  try {
    form = await new Request('http://internal/upload', {
      method: 'POST',
      headers: { 'content-type': req.headers.get('content-type') ?? '' },
      body: raw.buffer as ArrayBuffer,
    }).formData();
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
