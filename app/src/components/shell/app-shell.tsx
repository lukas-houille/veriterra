import type { ReactNode } from 'react';
import { AppTopBar } from './app-topbar';

// Coquille applicative partagée : barre de nav commune + fond de page unifié, montée une
// seule fois par le layout du groupe (app). Le shell n'impose que la barre et le fond ;
// chaque page garde son conteneur interne (dashboard pleine largeur, fiche centrée,
// explorer plein écran via une hauteur calculée sous la barre).

export interface AppShellProps {
  userInitials: string;
  userLabel?: string;
  children: ReactNode;
}

export function AppShell({ userInitials, userLabel, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <AppTopBar userInitials={userInitials} userLabel={userLabel} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
