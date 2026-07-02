import { auth } from '@/auth';
import { isUuid } from '@/lib/uuid';
import { deleteDocument, getDocumentForDownload } from '@/modules/terrains/documents';
import { getObjectStream } from '@/lib/storage/s3';

export const runtime = 'nodejs';

function unauthorized() {
  return Response.json({ error: 'unauthenticated' }, { status: 401 });
}
function notFound() {
  return Response.json({ error: 'introuvable' }, { status: 404 });
}

// GET /api/terrains/[id]/documents/[docId] : télécharge une pièce en flux (proxy authentifié).
// MinIO reste interne : aucune URL de stockage n'est exposée, chaque accès est ré-authentifié
// et re-scopé tenant (RLS). En-têtes durcis (nosniff, disposition selon la nature).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) return unauthorized();
  const { id, docId } = await params;
  if (!isUuid(id) || !isUuid(docId)) return notFound();

  const meta = await getDocumentForDownload(session.user.orgId, id, docId);
  if (!meta) return notFound();

  let stream: ReadableStream<Uint8Array>;
  let contentLength: number | undefined;
  try {
    const obj = await getObjectStream(meta.storageKey);
    stream = obj.body;
    contentLength = obj.contentLength;
  } catch {
    return Response.json({ error: 'fichier indisponible' }, { status: 502 });
  }

  // Les images sont affichées en ligne (grille photos), le reste est téléchargé. filename*
  // (RFC 5987) transporte le nom accentué sans risque d'échappement.
  const dispositionType = meta.kind === 'PHOTO' ? 'inline' : 'attachment';
  const encodedName = encodeURIComponent(meta.filename);
  const headers = new Headers({
    'Content-Type': meta.contentType,
    'Content-Disposition': `${dispositionType}; filename*=UTF-8''${encodedName}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=0, must-revalidate',
  });
  if (contentLength != null) headers.set('Content-Length', String(contentLength));

  return new Response(stream, { status: 200, headers });
}

// DELETE /api/terrains/[id]/documents/[docId] : supprime une pièce (scopé tenant).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId) return unauthorized();
  const { id, docId } = await params;
  if (!isUuid(id) || !isUuid(docId)) return notFound();

  const ok = await deleteDocument(session.user.orgId, id, docId);
  if (!ok) return notFound();
  return new Response(null, { status: 204 });
}
