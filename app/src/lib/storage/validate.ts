// Validation des pièces jointes, pure et testable (aucun accès réseau ni base). L'upload est
// une surface sensible : on n'accorde AUCUNE confiance au type déclaré par le client. Trois
// gardes complémentaires : liste blanche de types MIME, borne de taille, et vérification des
// octets d'en-tête (magic bytes) pour que le contenu réel corresponde au type annoncé.

/** Nature de la pièce, alignée sur l'enum Prisma `DocumentKind` (mêmes valeurs). */
export type DocumentKind = 'PHOTO' | 'DOCUMENT';

/** Un type MIME autorisé : sa nature d'affichage et le contrôle de ses octets d'en-tête. */
interface AllowedType {
  kind: DocumentKind;
  extension: string;
  /** Retourne vrai si l'en-tête `head` correspond bien à ce type (magic bytes). */
  sniff: (head: Uint8Array) => boolean;
}

function startsWith(head: Uint8Array, sig: number[], offset = 0): boolean {
  if (head.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (head[offset + i] !== sig[i]) return false;
  }
  return true;
}

// Signatures. PDF: "%PDF". JPEG: FF D8 FF. PNG: 89 50 4E 47 0D 0A 1A 0A. WebP: "RIFF"…"WEBP".
const PDF = [0x25, 0x50, 0x44, 0x46];
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** Liste blanche des types acceptés. Pas de SVG (XSS stocké), pas de HEIC (non affichable web). */
export const ALLOWED_TYPES: Record<string, AllowedType> = {
  'application/pdf': { kind: 'DOCUMENT', extension: 'pdf', sniff: (h) => startsWith(h, PDF) },
  'image/jpeg': { kind: 'PHOTO', extension: 'jpg', sniff: (h) => startsWith(h, JPEG) },
  'image/png': { kind: 'PHOTO', extension: 'png', sniff: (h) => startsWith(h, PNG) },
  'image/webp': { kind: 'PHOTO', extension: 'webp', sniff: (h) => startsWith(h, RIFF) && startsWith(h, WEBP, 8) },
};

/** Nombre d'octets d'en-tête suffisant pour toutes les signatures (WebP en demande 12). */
export const HEAD_BYTES = 16;

/** Normalise un type MIME (retire les paramètres `; charset=…`, passe en minuscules). */
export function normalizeContentType(raw: string): string {
  return (raw.split(';')[0] ?? '').trim().toLowerCase();
}

/** Nature d'affichage d'un type autorisé, ou null si le type n'est pas dans la liste blanche. */
export function classifyKind(contentType: string): DocumentKind | null {
  return ALLOWED_TYPES[normalizeContentType(contentType)]?.kind ?? null;
}

/** Vrai si les octets d'en-tête correspondent au type déclaré (contenu non usurpé). */
export function sniffMatches(contentType: string, head: Uint8Array): boolean {
  const t = ALLOWED_TYPES[normalizeContentType(contentType)];
  return t ? t.sniff(head) : false;
}

export type UploadRejectionCode = 'EMPTY' | 'TYPE' | 'SIZE' | 'CONTENT';

export type UploadValidation =
  | { ok: true; kind: DocumentKind; contentType: string }
  | { ok: false; code: UploadRejectionCode; message: string };

/**
 * Valide une pièce à déposer : non vide, type autorisé, taille sous la borne, et octets
 * d'en-tête cohérents avec le type. Ne throw pas : renvoie un verdict que la route mappe en
 * code HTTP (415 type, 413 taille, 400 contenu).
 */
export function validateUpload(
  input: { contentType: string; size: number; head: Uint8Array },
  maxBytes: number,
): UploadValidation {
  if (input.size <= 0) {
    return { ok: false, code: 'EMPTY', message: 'Fichier vide.' };
  }
  const contentType = normalizeContentType(input.contentType);
  const kind = classifyKind(contentType);
  if (!kind) {
    return { ok: false, code: 'TYPE', message: 'Type de fichier non autorisé (PDF, JPEG, PNG ou WebP).' };
  }
  if (input.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, code: 'SIZE', message: `Fichier trop volumineux (maximum ${mb} Mo).` };
  }
  if (!sniffMatches(contentType, input.head)) {
    return { ok: false, code: 'CONTENT', message: 'Le contenu du fichier ne correspond pas au type déclaré.' };
  }
  return { ok: true, kind, contentType };
}

/**
 * Assainit un nom de fichier pour l'affichage et l'en-tête Content-Disposition : remplace les
 * séparateurs de chemin, retire les caractères de contrôle (points de code < 0x20 ou 0x7F),
 * borne la longueur, garde un repli sûr. Ne sert JAMAIS de clé de stockage (celle-ci est un
 * UUID opaque, voir `buildStorageKey`).
 */
export function sanitizeFilename(name: string): string {
  let out = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue; // caractère de contrôle
    out += ch === '/' || ch === '\\' ? '_' : ch;
  }
  const cleaned = out.replace(/^\.+/, '').trim().slice(0, 200).trim();
  return cleaned.length > 0 ? cleaned : 'document';
}

/**
 * Clé de stockage objet, opaque et non devinable côté client. Le préfixe organisation est une
 * défense en profondeur : l'accès reste médié par la base sous RLS, jamais par la clé.
 */
export function buildStorageKey(orgId: string, terrainId: string, documentId: string): string {
  return `org/${orgId}/terrain/${terrainId}/${documentId}`;
}
