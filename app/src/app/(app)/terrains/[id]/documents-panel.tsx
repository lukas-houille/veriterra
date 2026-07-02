'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, UnavailableState } from '@veriterra/ui';
import type { DocumentSummary } from '@/modules/terrains/types';

// Panneau des pièces jointes (photos US-5.3, documents US-5.8). Îlot client greffé sur la fiche
// serveur (patron d'EditTerrainForm) : upload multipart puis `router.refresh()`, suppression puis
// refresh. Le download passe par une route proxy authentifiée (jamais d'URL de stockage exposée).

const DOC_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Non précisé' },
  { value: 'ETUDE_SOL', label: 'Étude de sol' },
  { value: 'BORNAGE', label: 'Bornage' },
  { value: 'CERTIFICAT_URBANISME', label: "Certificat d'urbanisme" },
  { value: 'DEVIS', label: 'Devis' },
  { value: 'DIAGNOSTIC', label: 'Diagnostic' },
  { value: 'AUTRE', label: 'Autre' },
];

const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const nfDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'date inconnue' : nfDate.format(d);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function provenance(doc: DocumentSummary): string {
  const who = doc.uploadedByName ? `Déposé par ${doc.uploadedByName}` : 'Déposé';
  return `${who}, le ${formatDate(doc.createdAt)}`;
}

function DocIcon() {
  return (
    <svg
      className="h-5 w-5 text-neutral-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function DocumentsPanel({
  terrainId,
  documents,
  maxUploadMb,
}: {
  terrainId: string;
  documents: DocumentSummary[];
  maxUploadMb: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [docType, setDocType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const maxBytes = maxUploadMb * 1024 * 1024;

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError('Choisir un fichier.');
      return;
    }
    if (!ALLOWED.has(file.type)) {
      setError('Type non autorisé (PDF, JPEG, PNG ou WebP).');
      return;
    }
    if (file.size > maxBytes) {
      setError(`Fichier trop volumineux (maximum ${maxUploadMb} Mo).`);
      return;
    }

    const body = new FormData();
    body.set('file', file);
    if (label.trim()) body.set('label', label.trim());
    if (docType) body.set('docType', docType);

    setUploading(true);
    try {
      const res = await fetch(`/api/terrains/${terrainId}/documents`, { method: 'POST', body });
      if (!res.ok) {
        let message = `L'ajout a échoué (code ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          message = data.error ?? message;
        } catch {
          // corps non JSON : message par défaut.
        }
        setError(message);
        setUploading(false);
        return;
      }
      setFile(null);
      setLabel('');
      setDocType('');
      formRef.current?.reset();
      setUploading(false);
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur.');
      setUploading(false);
    }
  }

  async function handleDelete(doc: DocumentSummary) {
    if (!window.confirm(`Supprimer « ${doc.label || doc.filename} » ?`)) return;
    setBusyId(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/terrains/${terrainId}/documents/${doc.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        setError(`La suppression a échoué (code ${res.status}).`);
        setBusyId(null);
        return;
      }
      setBusyId(null);
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur.');
      setBusyId(null);
    }
  }

  const photos = documents.filter((d) => d.kind === 'PHOTO');
  const docs = documents.filter((d) => d.kind === 'DOCUMENT');
  const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500';
  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-col gap-6">
      {/* Formulaire de dépôt */}
      <form
        ref={formRef}
        onSubmit={handleUpload}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="doc-file" className={fieldLabel}>
              Fichier (PDF, JPEG, PNG, WebP, {maxUploadMb} Mo max)
            </label>
            <input
              id="doc-file"
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-600 hover:file:bg-indigo-100"
            />
          </div>
          <div>
            <label htmlFor="doc-label" className={fieldLabel}>
              Libellé (facultatif)
            </label>
            <Input
              id="doc-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Étude de sol G2"
            />
          </div>
          <div>
            <label htmlFor="doc-type" className={fieldLabel}>
              Type de document
            </label>
            <select
              id="doc-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className={selectClass}
            >
              {DOC_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div>
          <Button type="submit" disabled={uploading}>
            {uploading ? 'Ajout...' : 'Ajouter la pièce'}
          </Button>
        </div>
      </form>

      {documents.length === 0 ? (
        <UnavailableState label="Aucun document" />
      ) : (
        <>
          {/* Photos en grille */}
          {photos.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Photos ({photos.length})
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p) => (
                  <figure key={p.id} className="overflow-hidden rounded-lg border border-border">
                    <a
                      href={`/api/terrains/${terrainId}/documents/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {/* Image servie par la route proxy authentifiée. next/image n'apporte rien
                          ici (source dynamique protégée, pas d'optimisation CDN). */}
                      <img
                        src={`/api/terrains/${terrainId}/documents/${p.id}`}
                        alt={p.label || p.filename}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </a>
                    <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="truncate text-xs text-neutral-600" title={p.label || p.filename}>
                        {p.label || p.filename}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        disabled={busyId === p.id}
                        className="shrink-0 rounded-sm text-xs text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* Documents en liste */}
          {docs.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Documents ({docs.length})
              </h3>
              <ul className="flex flex-col gap-2">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <DocIcon />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/api/terrains/${terrainId}/documents/${d.id}`}
                          className="truncate text-sm font-medium text-indigo-500 hover:underline"
                          title={d.label || d.filename}
                        >
                          {d.label || d.filename}
                        </a>
                        {d.docType ? <Badge variant="neutral">{DOC_TYPE_LABEL[d.docType] ?? d.docType}</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {d.filename} · {formatSize(d.sizeBytes)} · {provenance(d)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <a
                        href={`/api/terrains/${terrainId}/documents/${d.id}`}
                        className="text-xs text-indigo-500 hover:underline"
                      >
                        Télécharger
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(d)}
                        disabled={busyId === d.id}
                        className="rounded-sm text-xs text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
