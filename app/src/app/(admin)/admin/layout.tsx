import type { ReactNode } from 'react';
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { VeriterraMark } from '@/components/brand/veriterra-mark';

// Zone d'administration PLATEFORME (US-8.1), séparée du shell org-scopé. Garde de tête :
// requirePlatformAdmin (anonyme -> connexion, non-admin -> 404). Le garde est re-vérifié dans
// chaque page (défense en profondeur).

const navLink =
  'rounded-md px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <header className="sticky top-0 z-30 flex h-[3.625rem] items-center gap-3 border-b border-border bg-card px-4 sm:gap-5 sm:px-[22px]">
        <Link href="/admin" className="flex items-center gap-[11px] text-foreground">
          <VeriterraMark />
          <span className="text-lg font-bold tracking-[-0.02em]">
            Veriterra <span className="font-semibold text-neutral-400">Admin</span>
          </span>
        </Link>
        <nav aria-label="Navigation admin" className="ml-2 flex gap-1 overflow-x-auto sm:ml-4">
          <Link href="/admin" className={navLink}>
            Vue d&apos;ensemble
          </Link>
          <Link href="/admin/organisations" className={navLink}>
            Organisations
          </Link>
          <Link href="/admin/comptes" className={navLink}>
            Comptes
          </Link>
        </nav>
        <Link
          href="/dashboard"
          className="ml-auto shrink-0 rounded-md border border-border bg-card px-3 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retour à l&apos;app
        </Link>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
