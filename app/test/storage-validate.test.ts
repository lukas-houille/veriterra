import { describe, expect, it } from 'vitest';
import {
  buildStorageKey,
  classifyKind,
  normalizeContentType,
  sanitizeFilename,
  sniffMatches,
  validateUpload,
} from '@/lib/storage/validate';

// En-têtes réels (magic bytes) pour chaque type autorisé.
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe('classifyKind', () => {
  it('classe les images en PHOTO et le PDF en DOCUMENT', () => {
    expect(classifyKind('image/jpeg')).toBe('PHOTO');
    expect(classifyKind('image/png')).toBe('PHOTO');
    expect(classifyKind('image/webp')).toBe('PHOTO');
    expect(classifyKind('application/pdf')).toBe('DOCUMENT');
  });
  it('ignore les paramètres et la casse du type MIME', () => {
    expect(classifyKind('IMAGE/JPEG; charset=binary')).toBe('PHOTO');
  });
  it('refuse les types hors liste blanche (dont SVG et HTML)', () => {
    expect(classifyKind('image/svg+xml')).toBeNull();
    expect(classifyKind('text/html')).toBeNull();
    expect(classifyKind('application/octet-stream')).toBeNull();
  });
});

describe('normalizeContentType', () => {
  it('retire les paramètres et normalise la casse', () => {
    expect(normalizeContentType('Application/PDF; version=1.7')).toBe('application/pdf');
  });
});

describe('sniffMatches', () => {
  it('valide un en-tête cohérent avec le type déclaré', () => {
    expect(sniffMatches('application/pdf', PDF)).toBe(true);
    expect(sniffMatches('image/jpeg', JPEG)).toBe(true);
    expect(sniffMatches('image/png', PNG)).toBe(true);
    expect(sniffMatches('image/webp', WEBP)).toBe(true);
  });
  it('rejette un contenu usurpé (type déclaré ne correspondant pas aux octets)', () => {
    expect(sniffMatches('application/pdf', JPEG)).toBe(false); // JPEG déguisé en PDF
    expect(sniffMatches('image/png', PDF)).toBe(false);
  });
  it("rejette un WebP tronqué (RIFF sans marqueur WEBP)", () => {
    expect(sniffMatches('image/webp', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]))).toBe(false);
  });
});

describe('validateUpload', () => {
  const MAX = 25 * 1024 * 1024;

  it('accepte un fichier valide et renvoie sa nature', () => {
    const res = validateUpload({ contentType: 'application/pdf', size: 1000, head: PDF }, MAX);
    expect(res).toEqual({ ok: true, kind: 'DOCUMENT', contentType: 'application/pdf' });
  });
  it('refuse un fichier vide', () => {
    const res = validateUpload({ contentType: 'application/pdf', size: 0, head: PDF }, MAX);
    expect(res).toMatchObject({ ok: false, code: 'EMPTY' });
  });
  it('refuse un type hors liste blanche', () => {
    const res = validateUpload({ contentType: 'image/svg+xml', size: 100, head: PDF }, MAX);
    expect(res).toMatchObject({ ok: false, code: 'TYPE' });
  });
  it('refuse un fichier trop volumineux', () => {
    const res = validateUpload({ contentType: 'image/png', size: MAX + 1, head: PNG }, MAX);
    expect(res).toMatchObject({ ok: false, code: 'SIZE' });
  });
  it('refuse un contenu usurpé (règle 1 : jamais confiance au type déclaré)', () => {
    const res = validateUpload({ contentType: 'application/pdf', size: 100, head: JPEG }, MAX);
    expect(res).toMatchObject({ ok: false, code: 'CONTENT' });
  });
});

describe('sanitizeFilename', () => {
  it('remplace les séparateurs de chemin et borne la longueur', () => {
    // Les slashes deviennent des underscores, puis les points de tête sont retirés.
    expect(sanitizeFilename('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(sanitizeFilename('a'.repeat(300)).length).toBe(200);
  });
  it('retire les fichiers cachés en tête et garde un repli sûr', () => {
    expect(sanitizeFilename('...hidden')).toBe('hidden');
    expect(sanitizeFilename('   ')).toBe('document');
    expect(sanitizeFilename('')).toBe('document');
  });
  it('retire les caractères de contrôle (anti-injection d\'en-tête)', () => {
    expect(sanitizeFilename('etude\r\nsol.pdf')).toBe('etudesol.pdf');
  });
  it('conserve les accents et espaces', () => {
    expect(sanitizeFilename('Étude de sol.pdf')).toBe('Étude de sol.pdf');
  });
});

describe('buildStorageKey', () => {
  it('préfixe par organisation et terrain (clé opaque, non devinable)', () => {
    expect(buildStorageKey('org1', 'terr1', 'doc1')).toBe('org/org1/terrain/terr1/doc1');
  });
});
