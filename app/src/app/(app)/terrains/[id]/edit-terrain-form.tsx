'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@veriterra/ui';

// Formulaire d'édition d'un terrain (US-1.9). Composant client greffé sur la fiche serveur :
// bascule un panneau d'édition, PATCH /api/terrains/[id], puis rafraîchit la fiche. Ne touche
// pas aux données parcellaires (contour, surface, IDU), non éditables.

interface EditTerrainInitial {
  label: string;
  address: string;
  status: string;
  prixDemande: number | null;
  lienAnnonce: string | null;
  notes: string | null;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'A_ETUDIER', label: 'À étudier' },
  { value: 'PROMETTEUR', label: 'Prometteur' },
  { value: 'RESERVE', label: 'Réservé' },
  { value: 'ECARTE', label: 'Écarté' },
];

const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500';
const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function EditTerrainForm({
  terrainId,
  initial,
}: {
  terrainId: string;
  initial: EditTerrainInitial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(initial.label);
  const [address, setAddress] = useState(initial.address);
  const [status, setStatus] = useState(initial.status);
  const [prix, setPrix] = useState(initial.prixDemande != null ? String(initial.prixDemande) : '');
  const [lien, setLien] = useState(initial.lienAnnonce ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel(initial.label);
    setAddress(initial.address);
    setStatus(initial.status);
    setPrix(initial.prixDemande != null ? String(initial.prixDemande) : '');
    setLien(initial.lienAnnonce ?? '');
    setNotes(initial.notes ?? '');
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedLabel = label.trim();
    const trimmedAddress = address.trim();
    const trimmedPrix = prix.trim();
    const parsedPrix = trimmedPrix === '' ? null : Number(trimmedPrix);
    const nextLien = lien.trim() === '' ? null : lien.trim();
    const nextNotes = notes.trim() === '' ? null : notes.trim();

    if (trimmedLabel === '') {
      setError('Le libellé est requis.');
      return;
    }
    if (trimmedAddress === '') {
      setError("L'adresse est requise.");
      return;
    }
    if (parsedPrix !== null && !Number.isFinite(parsedPrix)) {
      setError('Le prix demandé doit être un nombre.');
      return;
    }

    // On n'envoie QUE les champs réellement modifiés (mise à jour partielle) : un membre qui
    // ne change que les notes n'écrase pas le statut qu'un autre membre vient de changer
    // (le last-write-wins reste limité au seul champ édité).
    const payload: Record<string, unknown> = {};
    if (trimmedLabel !== initial.label) payload.label = trimmedLabel;
    if (trimmedAddress !== initial.address) payload.address = trimmedAddress;
    if (status !== initial.status) payload.status = status;
    if (parsedPrix !== initial.prixDemande) payload.prixDemande = parsedPrix;
    if (nextLien !== (initial.lienAnnonce ?? null)) payload.lienAnnonce = nextLien;
    if (nextNotes !== (initial.notes ?? null)) payload.notes = nextNotes;

    if (Object.keys(payload).length === 0) {
      setOpen(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/terrains/${terrainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = `La modification a échoué (code ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          message = data.error ?? message;
        } catch {
          // corps non JSON : on garde le message par défaut.
        }
        setError(message);
        setSaving(false);
        return;
      }
      // Resynchronise les champs sur les valeurs canoniques renvoyées (bornées et arrondies
      // côté serveur) pour que le champ, le titre rafraîchi et « Annuler » restent cohérents.
      try {
        const data = (await res.json()) as { terrain?: EditTerrainInitial };
        const t = data.terrain;
        if (t) {
          setLabel(t.label);
          setAddress(t.address);
          setStatus(t.status);
          setPrix(t.prixDemande != null ? String(t.prixDemande) : '');
          setLien(t.lienAnnonce ?? '');
          setNotes(t.notes ?? '');
        }
      } catch {
        // réponse sans corps exploitable : le rafraîchissement serveur fait foi.
      }
      setOpen(false);
      setSaving(false);
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        'Supprimer ce terrain ? Cette action est définitive (parcelles, enrichissements et documents inclus).',
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/terrains/${terrainId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        setError(`La suppression a échoué (code ${res.status}).`);
        setDeleting(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur.');
      setDeleting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Modifier
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-label" className={fieldLabel}>
            Libellé
          </label>
          <Input id="edit-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label htmlFor="edit-status" className={fieldLabel}>
            Statut
          </label>
          <select
            id="edit-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit-address" className={fieldLabel}>
            Adresse
          </label>
          <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label htmlFor="edit-prix" className={fieldLabel}>
            Prix demandé (€)
          </label>
          <Input
            id="edit-prix"
            type="number"
            inputMode="numeric"
            min={0}
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            placeholder="150000"
          />
        </div>
        <div>
          <label htmlFor="edit-lien" className={fieldLabel}>
            Lien de l&apos;annonce
          </label>
          <Input
            id="edit-lien"
            type="url"
            value={lien}
            onChange={(e) => setLien(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit-notes" className={fieldLabel}>
            Notes
          </label>
          <textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving || deleting}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Annuler
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="ml-auto"
          disabled={deleting || saving}
          onClick={handleDelete}
        >
          {deleting ? 'Suppression...' : 'Supprimer le terrain'}
        </Button>
      </div>
    </form>
  );
}
