'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@veriterra/ui';
import { VeriterraMark } from '@/components/brand/veriterra-mark';
import { signOutAction } from './actions';

// Barre de navigation unique de l'app (dashboard, fiche, explorer). Auparavant réécrite
// en styles inline sur deux écrans et absente de la fiche : c'est la source du ressenti
// « page complètement différente » quand on ouvrait un terrain. Ici : un seul composant,
// en tokens Tailwind (aucun hex inline), avec la pastille active dérivée de l'URL.
// Sous le point de rupture `sm`, la navigation se replie dans un menu (bouton burger) pour
// rester utilisable au doigt sur téléphone (cibles tactiles >= 44 px).

export interface AppTopBarProps {
  /** Initiales du compte affichées dans la bulle (ex. « CL »). */
  userInitials: string;
  /** Libellé complet du compte (title de la bulle, ex. e-mail). */
  userLabel?: string;
  /** Admin plateforme : affiche le lien vers la zone /admin. */
  isPlatformAdmin?: boolean;
}

const navBase =
  'rounded-md px-[13px] py-[7px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const navActive = 'bg-indigo-50 font-semibold text-indigo-500';
const navIdle = 'font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700';

// Item du menu mobile : pleine largeur, cible tactile >= 44 px.
const menuItem =
  'flex min-h-11 items-center rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function AppTopBar({ userInitials, userLabel, isPlatformAdmin }: AppTopBarProps) {
  const pathname = usePathname() ?? '';
  const isExplorer = pathname.startsWith('/terrains/nouveau');
  const isTerrains = !isExplorer && (pathname.startsWith('/dashboard') || pathname.startsWith('/terrains'));
  const isProfil = pathname.startsWith('/profil');

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Referme le menu à chaque navigation (sinon il resterait ouvert après un clic sur un lien).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Referme sur Échap et sur clic en dehors du menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        // Rendre le focus au déclencheur (motif ARIA disclosure) : sans cela, le panneau
        // démonté laisse le focus tomber sur <body> et l'utilisateur clavier perd sa place.
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-[3.625rem] items-center gap-5 border-b border-border bg-card px-4 sm:px-[22px]">
      <Link href="/dashboard" className="flex items-center gap-[11px] text-foreground">
        <VeriterraMark />
        <span className="text-xl font-bold tracking-[-0.02em]">Veriterra</span>
      </Link>

      {/* Navigation inline (>= sm). Repliée dans le menu burger sur mobile. */}
      <nav aria-label="Navigation principale" className="ml-[14px] hidden gap-1 sm:flex">
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

      {/* Cluster compte inline (>= sm). */}
      <div className="ml-auto hidden items-center gap-3 sm:flex">
        {isPlatformAdmin && (
          <Link href="/admin" className={cn(navBase, navIdle)}>
            Administration
          </Link>
        )}
        <Link
          href="/profil"
          aria-current={isProfil ? 'page' : undefined}
          className={cn(navBase, isProfil ? navActive : navIdle)}
        >
          Profil
        </Link>
        <Link
          href="/profil"
          title={userLabel}
          aria-label={userLabel ? `Profil (${userLabel})` : 'Profil'}
          className="flex h-[38px] w-[38px] select-none items-center justify-center rounded-full bg-indigo-500 text-[13px] font-bold tracking-[0.02em] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {userInitials}
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md border border-border bg-card px-[13px] py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Se déconnecter
          </button>
        </form>
      </div>

      {/* Menu mobile (< sm) : bouton burger + panneau déroulant. */}
      <div ref={menuRef} className="relative ml-auto sm:hidden">
        <button
          ref={buttonRef}
          type="button"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
          aria-controls="app-mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {menuOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          )}
        </button>

        {menuOpen && (
          <nav
            id="app-mobile-menu"
            aria-label="Navigation"
            className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-60 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-lg border border-border bg-card p-2 shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
              <span className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-indigo-500 text-[13px] font-bold text-white">
                {userInitials}
              </span>
              {userLabel && <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{userLabel}</span>}
            </div>
            <Link
              href="/terrains/nouveau"
              aria-current={isExplorer ? 'page' : undefined}
              className={cn(menuItem, isExplorer ? navActive : navIdle)}
            >
              Explorer
            </Link>
            <Link
              href="/dashboard"
              aria-current={isTerrains ? 'page' : undefined}
              className={cn(menuItem, isTerrains ? navActive : navIdle)}
            >
              Mes terrains
            </Link>
            {isPlatformAdmin && (
              <Link href="/admin" className={cn(menuItem, navIdle)}>
                Administration
              </Link>
            )}
            <Link
              href="/profil"
              aria-current={isProfil ? 'page' : undefined}
              className={cn(menuItem, isProfil ? navActive : navIdle)}
            >
              Profil
            </Link>
            <form action={signOutAction} className="mt-1 border-t border-border pt-2">
              <button
                type="submit"
                className="flex min-h-11 w-full items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Se déconnecter
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
