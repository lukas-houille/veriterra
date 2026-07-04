import { randomUUID } from 'node:crypto';
import { forOrg } from '@veriterra/db';
import { deleteObject, maxUploadBytes, orgStorageQuotaBytes, putObject, wouldExceedOrgQuota } from '@/lib/storage/s3';
import {
  buildStorageKey,
  HEAD_BYTES,
  sanitizeFilename,
  validateUpload,
  type UploadRejectionCode,
} from '@/lib/storage/validate';
import { DOCUMENT_TYPES, type DocumentKindValue, type DocumentSummary, type DocumentTypeValue } from './types';

// Service des pièces jointes d'un terrain (photos US-5.3, documents US-5.8). Toutes les
// opérations sont scopées au tenant via `forOrg` (RLS) : une pièce d'une autre organisation est
// invisible (renvoie null/false, jamais d'accès inter-org). Le fichier vit dans MinIO ; la base
// ne porte que métadonnées et provenance.

// Forme minimale d'une ligne TerrainDocument (évite de dépendre des types Prisma générés).
type DocumentRow = {
  id: string;
  terrainId: string;
  kind: string;
  docType: string | null;
  label: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedById: string | null;
  createdAt: Date;
};

function isDocType(v: string | null | undefined): v is DocumentTypeValue {
  return v != null && (DOCUMENT_TYPES as readonly string[]).includes(v);
}

/** Résout le nom (ou l'email) des déposants visibles dans le tenant (User RLS via Membership). */
async function uploaderNames(orgId: string, ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = (await forOrg(orgId).user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  })) as Array<{ id: string; name: string | null; email: string | null }>;
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? null]));
}

function toSummary(row: DocumentRow, names: Map<string, string | null>): DocumentSummary {
  return {
    id: row.id,
    kind: row.kind as DocumentKindValue,
    docType: (row.docType as DocumentTypeValue | null) ?? null,
    label: row.label,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedByName: row.uploadedById ? (names.get(row.uploadedById) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Fichier reçu par la route (déjà lu en mémoire), à valider et persister. */
export interface UploadFile {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export type CreateDocumentResult =
  | { ok: true; document: DocumentSummary }
  | { ok: false; code: 'NOT_FOUND' | 'QUOTA' | UploadRejectionCode; message: string };

/**
 * Dépose une pièce jointe : vérifie que le terrain est dans le tenant, valide le fichier
 * (type, taille, octets d'en-tête), écrit l'objet dans MinIO puis insère la ligne. En cas
 * d'échec d'insertion, l'objet est nettoyé (pas d'orphelin). Ne throw pas sur un refus de
 * validation : renvoie un verdict que la route mappe en code HTTP.
 */
export async function createDocument(
  orgId: string,
  terrainId: string,
  uploadedById: string | null,
  input: { file: UploadFile; label?: string | null; docType?: string | null },
): Promise<CreateDocumentResult> {
  const db = forOrg(orgId);
  const terrain = (await db.terrain.findUnique({
    where: { id: terrainId },
    select: { id: true },
  })) as { id: string } | null;
  if (!terrain) return { ok: false, code: 'NOT_FOUND', message: 'Terrain introuvable.' };

  const { file } = input;
  const head = new Uint8Array(file.bytes.subarray(0, HEAD_BYTES));
  const verdict = validateUpload(
    { contentType: file.contentType, size: file.bytes.length, head },
    maxUploadBytes(),
  );
  if (!verdict.ok) return { ok: false, code: verdict.code, message: verdict.message };

  // Quota de stockage agrégé par organisation (audit sécurité, finding LOW) : borne l'espace total
  // du tenant pour éviter d'épuiser le stockage partagé. Le total courant est scopé RLS (forOrg).
  const quotaBytes = orgStorageQuotaBytes();
  if (quotaBytes > 0) {
    const agg = (await db.terrainDocument.aggregate({ _sum: { sizeBytes: true } })) as {
      _sum: { sizeBytes: number | null };
    };
    if (wouldExceedOrgQuota(agg._sum.sizeBytes ?? 0, file.bytes.length, quotaBytes)) {
      return {
        ok: false,
        code: 'QUOTA',
        message: "Quota de stockage de l'organisation atteint.",
      };
    }
  }

  const documentId = randomUUID();
  const storageKey = buildStorageKey(orgId, terrainId, documentId);
  const docType = isDocType(input.docType) ? input.docType : null;
  const trimmedLabel = input.label?.trim();
  const label = trimmedLabel ? trimmedLabel.slice(0, 200) : null;

  await putObject(storageKey, file.bytes, verdict.contentType);
  let created: DocumentRow;
  try {
    created = (await db.terrainDocument.create({
      data: {
        id: documentId,
        organisationId: orgId,
        terrainId,
        kind: verdict.kind,
        docType: docType ?? undefined,
        label: label ?? undefined,
        filename: sanitizeFilename(file.filename),
        contentType: verdict.contentType,
        sizeBytes: file.bytes.length,
        storageKey,
        uploadedById: uploadedById ?? undefined,
      },
    })) as unknown as DocumentRow;
  } catch (e) {
    // Insertion refusée (RLS WITH CHECK, contrainte) : l'objet vient d'être écrit, on le retire.
    await deleteObject(storageKey).catch(() => undefined);
    throw e;
  }

  const names = await uploaderNames(orgId, uploadedById ? [uploadedById] : []);
  return { ok: true, document: toSummary(created, names) };
}

/** Liste les pièces d'un terrain (scopé tenant), avec le nom des déposants. */
export async function listDocuments(orgId: string, terrainId: string): Promise<DocumentSummary[]> {
  const rows = (await forOrg(orgId).terrainDocument.findMany({
    where: { terrainId },
    orderBy: { createdAt: 'asc' },
  })) as unknown as DocumentRow[];
  const names = await uploaderNames(
    orgId,
    rows.map((r) => r.uploadedById ?? '').filter(Boolean),
  );
  return rows.map((r) => toSummary(r, names));
}

/** Métadonnées nécessaires au téléchargement (la route récupère le flux depuis MinIO). */
export interface DownloadMeta {
  storageKey: string;
  filename: string;
  contentType: string;
  kind: DocumentKindValue;
  sizeBytes: number;
}

/**
 * Récupère les métadonnées d'une pièce pour le téléchargement. Scopé tenant (`forOrg`) : une
 * pièce d'une autre org est invisible (null). Vérifie aussi l'appartenance au terrain de la route.
 */
export async function getDocumentForDownload(
  orgId: string,
  terrainId: string,
  docId: string,
): Promise<DownloadMeta | null> {
  const row = (await forOrg(orgId).terrainDocument.findUnique({
    where: { id: docId },
  })) as unknown as DocumentRow | null;
  if (!row || row.terrainId !== terrainId) return null;
  return {
    storageKey: row.storageKey,
    filename: row.filename,
    contentType: row.contentType,
    kind: row.kind as DocumentKindValue,
    sizeBytes: row.sizeBytes,
  };
}

/**
 * Supprime une pièce (scopé tenant). Retire la ligne d'abord (source de vérité, RLS-gardée) puis
 * l'objet en best-effort : une ligne orpheline (objet manquant) serait pire qu'un objet orphelin.
 */
export async function deleteDocument(orgId: string, terrainId: string, docId: string): Promise<boolean> {
  const db = forOrg(orgId);
  const row = (await db.terrainDocument.findUnique({
    where: { id: docId },
  })) as unknown as DocumentRow | null;
  if (!row || row.terrainId !== terrainId) return false;
  try {
    await db.terrainDocument.delete({ where: { id: docId } });
  } catch (e) {
    if ((e as { code?: unknown }).code === 'P2025') return false;
    throw e;
  }
  await deleteObject(row.storageKey).catch(() => undefined);
  return true;
}
