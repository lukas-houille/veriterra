'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn, StatusPin } from '@veriterra/ui';
import { STATUS_LIST, statusMeta } from '@/modules/terrains/status';

// Changement de statut rapide (US-5.1), partagé par l'en-tête de fiche et les lignes du dashboard.
// Bouton = pin + libellé courant + chevron ; ouvre un menu des 7 états ; au choix, PATCH scopé tenant
// puis `router.refresh()`. Motif disclosure : Échap et clic extérieur (fond invisible) referment, focus
// rendu au bouton. Menu en `position: fixed` pour échapper au `overflow-hidden` du tableau ; il bascule
// vers le HAUT s'il manque de place en bas, et sa hauteur est bornée (défilement interne) : ainsi tous
// les états restent atteignables même pour une ligne en bas de fenêtre.

export interface StatusChangerProps {
  terrainId: string;
  /** Statut courant (clé enum stockée). */
  status: string;
  /** Classes du conteneur (ex. positionnement/`z-index` dans une ligne de tableau). */
  className?: string;
}

const MENU_WIDTH = 224; // w-56
const MENU_EST_HEIGHT = 300; // hauteur estimée (7 états) pour décider du sens d'ouverture

interface MenuPos {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export function StatusChanger({ terrainId, status, className }: StatusChangerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = statusMeta(status);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8));
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      // Ouvre vers le haut si la place en bas est insuffisante et qu'il y en a plus au-dessus.
      const openUp = below < Math.min(MENU_EST_HEIGHT, 240) && above > below;
      setMenuPos({
        left,
        maxHeight: Math.max(140, openUp ? above : below),
        ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // Le menu est en position fixe : au scroll/resize de la PAGE il se détacherait du bouton, on le
    // referme. Un défilement INTERNE au menu (liste bornée) ne doit pas le fermer.
    const onScrollResize = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open]);

  const change = async (next: string) => {
    setOpen(false);
    buttonRef.current?.focus(); // rend le focus au déclencheur (l'item choisi est démonté)
    if (next === status) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/terrains/${terrainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Recharge les composants serveur (en-tête fiche, tableau, carte) pour refléter le nouveau statut.
      router.refresh();
    } catch {
      setError('Changement impossible, réessayez.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cn('relative inline-flex flex-col items-start', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Statut : ${current.label}. Modifier.`}
        disabled={pending}
        onClick={toggle}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <StatusPin status={current.pin} />
        <span className="truncate">{current.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-neutral-400">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && menuPos && (
        <>
          {/* Fond invisible : un clic « à l'extérieur » referme le menu ET absorbe le clic (sinon il
              atteindrait le lien étiré de la ligne du tableau et naviguerait vers la fiche). */}
          <div aria-hidden="true" onMouseDown={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Choisir un statut"
            style={{ position: 'fixed', left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom, width: MENU_WIDTH, maxHeight: menuPos.maxHeight }}
            className="z-50 flex max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg"
          >
            {STATUS_LIST.map((s) => {
              const active = s.key === status;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => void change(s.key)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:bg-neutral-100',
                    active ? 'font-semibold text-foreground' : 'text-neutral-600',
                  )}
                >
                  <StatusPin status={s.pin} />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <span role="alert" className="mt-1 text-[11px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
