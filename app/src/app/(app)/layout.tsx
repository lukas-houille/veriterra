import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import { AppShell } from '@/components/shell/app-shell';

// Layout du groupe de routes authentifié (app) : dashboard, fiche terrain et explorer.
// Ne change PAS les URL (le groupe est transparent). Garde la session en un seul endroit
// (default-deny) et monte le shell commun (barre de nav + fond) une seule fois pour les
// trois écrans. La landing, sign-in et onboarding restent HORS du groupe (pas de nav produit).

/** Initiales du compte pour la bulle de la barre : à partir du nom, sinon de l'e-mail. */
function initials(name?: string | null, email?: string | null): string {
  const src = (name ?? '').trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
    return (first + second).toUpperCase() || '?';
  }
  const local = (email ?? '').split('@')[0] ?? '';
  return (local.slice(0, 2) || '?').toUpperCase();
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const label: string | undefined = session.user.name ?? session.user.email ?? undefined;

  return (
    <AppShell userInitials={initials(session.user.name, session.user.email)} userLabel={label}>
      {children}
    </AppShell>
  );
}
