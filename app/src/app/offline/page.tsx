import type { Metadata } from 'next';
import Link from 'next/link';
import { VeriterraMark } from '@/components/brand/veriterra-mark';

// Page de repli servie par le service worker quand une navigation échoue faute de réseau.
// Volontairement statique et sans donnée : aucune fiche ni donnée de tenant n'est mise en
// cache (règles 1 et 2), la consultation hors-ligne des fiches reste un lot séparé.
export const metadata: Metadata = {
  title: 'Hors ligne · Veriterra',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center text-foreground">
      <div className="flex items-center gap-3">
        <VeriterraMark />
        <span className="text-2xl font-bold tracking-[-0.02em]">Veriterra</span>
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-bold">Vous êtes hors ligne</h1>
        <p className="text-sm leading-relaxed text-neutral-500">
          La connexion réseau est indisponible. Veriterra a besoin du réseau pour afficher des données
          sourcées et à jour. Reconnectez-vous, puis réessayez.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center rounded-md bg-indigo-500 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Réessayer
      </Link>
    </main>
  );
}
