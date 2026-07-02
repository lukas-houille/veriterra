'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@veriterra/ui';
import { VeriterraMark } from '@/components/brand/veriterra-mark';
import { signOutAction } from './actions';

// Barre de navigation unique de l'app (dashboard, fiche, explorer). Auparavant réécrite
// en styles inline sur deux écrans et absente de la fiche : c'est la source du ressenti
// « page complètement différente » quand on ouvrait un terrain. Ici : un seul composant,
// en tokens Tailwind (aucun hex inline), avec la pastille active dérivée de l'URL.

export interface AppTopBarProps {
  /** Initiales du compte affichées dans la bulle (ex. « CL »). */
  userInitials: string;
  /** Libellé complet du compte (title de la bulle, ex. e-mail). */
  userLabel?: string;
}

const navBase =
  'rounded-md px-[13px] py-[7px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const navActive = 'bg-indigo-50 font-semibold text-indigo-500';
const navIdle = 'font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700';

export function AppTopBar({ userInitials, userLabel }: AppTopBarProps) {
  const pathname = usePathname() ?? '';
  const isExplorer = pathname.startsWith('/terrains/nouveau');
  const isTerrains = !isExplorer && (pathname.startsWith('/dashboard') || pathname.startsWith('/terrains'));

  return (
    <header className="sticky top-0 z-30 flex h-[3.625rem] items-center gap-5 border-b border-border bg-card px-[22px]">
      <Link href="/dashboard" className="flex items-center gap-[11px] text-foreground">
        <VeriterraMark />
        <span className="text-xl font-bold tracking-[-0.02em]">Veriterra</span>
      </Link>

      <nav aria-label="Navigation principale" className="ml-[14px] flex gap-1">
        <Link
          href="/terrains/nouveau"
          aria-current={isExplorer ? 'page' : undefined}
          className={cn(navBase, isExplorer ? navActive : navIdle)}
        >
          Explorer
        </Link>
        <Link
          href="/dashboard"
          aria-current={isTerrains ? 'page' : undefined}
          className={cn(navBase, isTerrains ? navActive : navIdle)}
        >
          Mes terrains
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <Link href="/onboarding" className={cn(navBase, navIdle)}>
          Mon projet
        </Link>
        <span
          title={userLabel}
          aria-hidden="true"
          className="flex h-[38px] w-[38px] select-none items-center justify-center rounded-full bg-indigo-500 text-[13px] font-bold tracking-[0.02em] text-white"
        >
          {userInitials}
        </span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md border border-border bg-card px-[13px] py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </header>
  );
}
