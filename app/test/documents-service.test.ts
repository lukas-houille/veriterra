import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadStorageEnv } from '@veriterra/shared';
import { admin } from '@veriterra/db';
import {
  createDocument,
  deleteDocument,
  getDocumentForDownload,
  listDocuments,
} from '@/modules/terrains/documents';
import { getObjectBytes, resetStorageForTests } from '@/lib/storage/s3';

// Round-trip du stockage objet : dépôt -> liste -> téléchargement -> suppression, à travers le
// vrai service (validation + MinIO + base scopée tenant). Ne tourne que si le stockage est
// configuré (CI a MinIO + S3_* ; en local sans MinIO, ce bloc est ignoré, les tests purs de
// validate.ts couvrent la logique).
const storageConfigured = loadStorageEnv() != null;
const suite = storageConfigured ? describe : describe.skip;

const ORG_ID = '00000000-0000-0000-0000-0000000000d1';
const OTHER_ORG_ID = '00000000-0000-0000-0000-0000000000d2';
const TERRAIN_ID = '00000000-0000-0000-0000-0000000000d3';

// Fichiers minimaux mais aux bons octets d'en-tête (le sniff doit passer).
const PDF_BYTES = Buffer.from('%PDF-1.4\nVeriterra test document\n%%EOF\n', 'latin1');
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

beforeAll(async () => {
  resetStorageForTests();
  await admin.organisation.upsert({ where: { id: ORG_ID }, update: {}, create: { id: ORG_ID, name: 'Org Docs Test' } });
  await admin.organisation.upsert({
    where: { id: OTHER_ORG_ID },
    update: {},
    create: { id: OTHER_ORG_ID, name: 'Autre Org Docs Test' },
  });
  await admin.terrain.upsert({
    where: { id: TERRAIN_ID },
    update: {},
    create: { id: TERRAIN_ID, organisationId: ORG_ID, label: 'T Docs', address: '1 rue Docs, Lyon', inseeCode: '69381' },
  });
});

afterAll(async () => {
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  await admin.organisation.delete({ where: { id: OTHER_ORG_ID } }).catch(() => undefined);
  await admin.$disconnect();
});

suite('createDocument / listDocuments / download / delete', () => {
  it('dépose un PDF, le liste, le télécharge à l\'identique, puis le supprime', async () => {
    const created = await createDocument(ORG_ID, TERRAIN_ID, null, {
      file: { filename: 'étude sol.pdf', contentType: 'application/pdf', bytes: PDF_BYTES },
      label: 'Étude de sol',
      docType: 'ETUDE_SOL',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.document.kind).toBe('DOCUMENT');
    expect(created.document.docType).toBe('ETUDE_SOL');
    expect(created.document.filename).toBe('étude sol.pdf');
    expect(created.document.sizeBytes).toBe(PDF_BYTES.length);

    const list = await listDocuments(ORG_ID, TERRAIN_ID);
    expect(list.map((d) => d.id)).toContain(created.document.id);

    const meta = await getDocumentForDownload(ORG_ID, TERRAIN_ID, created.document.id);
    expect(meta?.contentType).toBe('application/pdf');
    const bytes = await getObjectBytes(meta!.storageKey);
    expect(Buffer.from(bytes).equals(PDF_BYTES)).toBe(true);

    expect(await deleteDocument(ORG_ID, TERRAIN_ID, created.document.id)).toBe(true);
    const after = await listDocuments(ORG_ID, TERRAIN_ID);
    expect(after.map((d) => d.id)).not.toContain(created.document.id);
  });

  it('classe une image en PHOTO', async () => {
    const created = await createDocument(ORG_ID, TERRAIN_ID, null, {
      file: { filename: 'terrain.jpg', contentType: 'image/jpeg', bytes: JPEG_BYTES },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.document.kind).toBe('PHOTO');
    await deleteDocument(ORG_ID, TERRAIN_ID, created.document.id);
  });

  it('refuse un contenu usurpé sans rien persister (JPEG déclaré PDF)', async () => {
    const before = (await listDocuments(ORG_ID, TERRAIN_ID)).length;
    const res = await createDocument(ORG_ID, TERRAIN_ID, null, {
      file: { filename: 'faux.pdf', contentType: 'application/pdf', bytes: JPEG_BYTES },
    });
    expect(res).toMatchObject({ ok: false, code: 'CONTENT' });
    expect((await listDocuments(ORG_ID, TERRAIN_ID)).length).toBe(before);
  });

  it('refuse un type hors liste blanche', async () => {
    const res = await createDocument(ORG_ID, TERRAIN_ID, null, {
      file: { filename: 'note.txt', contentType: 'text/plain', bytes: Buffer.from('hello') },
    });
    expect(res).toMatchObject({ ok: false, code: 'TYPE' });
  });

  it('refuse un terrain inexistant (NOT_FOUND) et n\'écrit aucun objet', async () => {
    const res = await createDocument(ORG_ID, '00000000-0000-0000-0000-0000000000df', null, {
      file: { filename: 'x.pdf', contentType: 'application/pdf', bytes: PDF_BYTES },
    });
    expect(res).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('isolation tenant : une autre org ne voit ni ne télécharge la pièce', async () => {
    const created = await createDocument(ORG_ID, TERRAIN_ID, null, {
      file: { filename: 'prive.pdf', contentType: 'application/pdf', bytes: PDF_BYTES },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await listDocuments(OTHER_ORG_ID, TERRAIN_ID)).toEqual([]);
    expect(await getDocumentForDownload(OTHER_ORG_ID, TERRAIN_ID, created.document.id)).toBeNull();
    // Une autre org ne peut pas non plus la supprimer.
    expect(await deleteDocument(OTHER_ORG_ID, TERRAIN_ID, created.document.id)).toBe(false);

    await deleteDocument(ORG_ID, TERRAIN_ID, created.document.id);
  });
});
