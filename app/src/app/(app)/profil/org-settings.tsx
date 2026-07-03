'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Renommage de l'organisation courante (OWNER/ADMIN). PATCH /api/org, qui cible l'org de la session
// (jamais un id client). Rendu seulement si l'utilisateur a le droit (canManage), sinon lecture seule.

export function OrgSettings({ initialName, canManage }: { initialName: string; canManage: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!canManage) {
    return (
      <p className="m-0 text-sm text-neutral-600">
        Organisation : <span className="font-semibold text-foreground">{initialName}</span>
      </p>
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setMsg({ ok: false, text: 'Renommage impossible. Réessayez.' });
        return;
      }
      setMsg({ ok: true, text: 'Organisation renommée.' });
      // Rafraîchit le server component : le nom se met à jour partout (bloc Compte, en-tête membres)
      // et le bouton se redésactive (initialName rejoint la valeur enregistrée).
      router.refresh();
    } catch {
      setMsg({ ok: false, text: 'Impossible de joindre le serveur.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="org-name" className="mb-1.5 block text-xs font-semibold text-neutral-600">
          Nom de l&apos;organisation
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-[220px] flex-1 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            disabled={saving || name.trim() === '' || name.trim() === initialName}
            onClick={() => void save()}
            className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {saving ? '...' : 'Renommer'}
          </button>
        </div>
      </div>
      {msg && (
        <p
          role={msg.ok ? 'status' : 'alert'}
          aria-live="polite"
          className={
            'm-0 text-[13px] ' + (msg.ok ? 'text-emerald-700' : 'text-destructive')
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
