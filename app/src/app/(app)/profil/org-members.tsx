'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrgInvitation, OrgMember, OrgRole } from '@/modules/organisation/service';

// Gestion des membres et invitations de l'organisation courante (bloc Organisation du profil).
// Invite par e-mail (pré-autorisation : le rattachement se fait au login de l'invité), révoque une
// invitation, change le rôle d'un membre ou le retire. Toutes les actions passent par les routes
// /api/org/* (gardées OWNER/ADMIN, org de la session), puis rafraîchissent le server component. Les
// invariants fins (seul un OWNER gère un OWNER, jamais le dernier OWNER) sont imposés côté serveur ;
// l'UI reflète les droits pour éviter les actions vouées à échouer.

const ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';
const btnPrimary =
  'shrink-0 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
const btnGhost =
  'shrink-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const selectClass =
  'rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export function OrgMembers({
  members,
  invitations,
  canManage,
  isOwner,
  currentUserId,
}: {
  members: OrgMember[];
  invitations: OrgInvitation[];
  canManage: boolean;
  isOwner: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');

  async function call(url: string, init: RequestInit, okText: string): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({ ok: false, text: body?.error ?? 'Action impossible. Réessayez.' });
        return false;
      }
      setMsg({ ok: true, text: okText });
      router.refresh();
      return true;
    } catch {
      setMsg({ ok: false, text: 'Impossible de joindre le serveur.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    if (email.trim() === '') return;
    const ok = await call(
      '/api/org/invitations',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), role: inviteRole }) },
      'Invitation enregistrée. La personne rejoindra l\'organisation à sa prochaine connexion.',
    );
    if (ok) setEmail('');
  }

  const revoke = (id: string) => call(`/api/org/invitations/${id}`, { method: 'DELETE' }, 'Invitation révoquée.');
  const changeRole = (userId: string, role: OrgRole) =>
    call(`/api/org/members/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) }, 'Rôle mis à jour.');
  const remove = (userId: string) => call(`/api/org/members/${userId}`, { method: 'DELETE' }, 'Membre retiré.');

  /** L'acteur peut-il agir sur ce membre ? Pas soi-même ; un OWNER n'est géré que par un OWNER. */
  const canActOn = (m: OrgMember) => canManage && m.userId !== currentUserId && (m.role !== 'OWNER' || isOwner);
  const roleOptions: OrgRole[] = isOwner ? ['OWNER', 'ADMIN', 'MEMBER'] : ['ADMIN', 'MEMBER'];

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <div>
          <label htmlFor="invite-email" className="mb-1.5 block text-xs font-semibold text-neutral-600">
            Inviter par e-mail
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="collegue@exemple.fr"
              className={`${inputClass} min-w-[200px] flex-1`}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value === 'ADMIN' ? 'ADMIN' : 'MEMBER')}
              aria-label="Rôle de l'invité"
              className={`${selectClass} py-2.5`}
            >
              <option value="MEMBER">Membre</option>
              <option value="ADMIN">Administrateur</option>
            </select>
            <button type="button" disabled={busy || email.trim() === ''} onClick={() => void invite()} className={btnPrimary}>
              Inviter
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-400">
            La personne rejoint l&apos;organisation en se connectant avec cette adresse (Pocket ID).
          </p>
        </div>
      )}

      {msg && (
        <p
          role={msg.ok ? 'status' : 'alert'}
          aria-live="polite"
          className={
            'm-0 rounded-lg border px-3 py-2.5 text-[13px] ' +
            (msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-destructive/30 bg-destructive/10 text-destructive')
          }
        >
          {msg.text}
        </p>
      )}

      {canManage && invitations.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-neutral-500">Invitations en attente ({invitations.length})</div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-background px-3.5 py-2.5"
              >
                <span className="min-w-0 break-words text-sm text-foreground">
                  {inv.email}
                  <span className="ml-2 text-xs text-neutral-500">{ROLE_LABEL[inv.role]}</span>
                </span>
                <button type="button" disabled={busy} onClick={() => void revoke(inv.id)} className={btnGhost}>
                  Révoquer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-semibold text-neutral-500">Membres ({members.length})</div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5"
            >
              <span className="min-w-0 break-words text-sm text-foreground">
                {m.name ?? m.email ?? 'Membre'}
                {m.userId === currentUserId && <span className="ml-2 text-xs text-neutral-500">(vous)</span>}
                {m.email && m.name && <span className="ml-2 text-xs text-neutral-500">{m.email}</span>}
              </span>
              {canActOn(m) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => void changeRole(m.userId, e.target.value as OrgRole)}
                    disabled={busy}
                    aria-label={`Rôle de ${m.name ?? m.email ?? 'ce membre'}`}
                    className={selectClass}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={busy} onClick={() => void remove(m.userId)} className={btnGhost}>
                    Retirer
                  </button>
                </div>
              ) : (
                <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-500">
                  {ROLE_LABEL[m.role]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
