import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, StatusPin } from '@veriterra/ui';
import { auth } from '@/auth';
import { listTerrainsWithScores } from '@/modules/terrains/service';
import { getActiveProjet } from '@/modules/projet/service';
import { STATUS_LIST } from '@/modules/terrains/status';
import { DashboardMap } from '@/components/map/dashboard-map';
import { TerrainsTable } from './terrains-table';

// Tableau de bord des terrains du projet (Tranche 1, US-5.2). Composant serveur : lit la
// session (tenant garanti par proxy.ts), exige un projet (sinon onboarding), et charge les
// terrains de l'organisation directement via le service. Rendu en tokens du design system
// (Card/Button/StatusPin/Badge), sans hex inline, sous le shell commun. Conformément à la
// règle « pas de donnée par défaut silencieuse », seules les colonnes dont la source réelle
// existe sont affichées, et un prix absent est marqué « Indisponible ».

const surfaceFormat = new Intl.NumberFormat('fr-FR');
const prixFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function projetResume(projet: {
  budgetMax: number | null;
  surfaceMinM2: number | null;
  surfaceMaxM2: number | null;
}): string | null {
  const parts: string[] = [];
  if (projet.budgetMax != null) parts.push(`budget ${prixFormat.format(projet.budgetMax)}`);
  if (projet.surfaceMinM2 != null || projet.surfaceMaxM2 != null) {
    const min = projet.surfaceMinM2 != null ? surfaceFormat.format(projet.surfaceMinM2) : '…';
    const max = projet.surfaceMaxM2 != null ? surfaceFormat.format(projet.surfaceMaxM2) : '…';
    parts.push(`${min} à ${max} m²`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  // Le projet cadre tout le reste : s'il n'existe pas, on passe par l'onboarding court.
  const projet = await getActiveProjet(session.user.orgId);
  if (!projet) redirect('/onboarding');

  const terrains = await listTerrainsWithScores(session.user.orgId);
  const resume = projetResume(projet);
  const total = terrains.length;

  // Répartition réelle par statut, pour les chips de la barre de filtres (affichage).
  const counts: Record<string, number> = {};
  for (const t of terrains) counts[t.status] = (counts[t.status] ?? 0) + 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      {/* Titre + action */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Terrains du projet</h1>
          <p className="mt-1 text-sm text-neutral-500">
            <span className="font-mono font-medium tabular-nums text-indigo-500">{surfaceFormat.format(total)}</span>{' '}
            {total > 1 ? 'terrains suivis' : 'terrain suivi'}
            {' · '}
            <span>{resume ? `${projet.name} (${resume})` : projet.name}</span>
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/terrains/nouveau">
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Ajouter un terrain
          </Link>
        </Button>
      </div>

      {/* Répartition par statut (comptages réels) */}
      <div
        aria-label="Répartition des terrains par statut"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
      >
        {STATUS_LIST.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-neutral-600"
          >
            <StatusPin status={s.pin} className="h-2.5 w-2.5" />
            {s.label}
            <span className="font-mono text-[11px] tabular-nums text-neutral-400">{counts[s.key] ?? 0}</span>
          </span>
        ))}
      </div>

      {/* Split : tableau + carte, ou état vide */}
      {total === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card px-6 py-12 text-center shadow-sm">
          <p className="text-base font-semibold text-foreground">Aucun terrain pour le moment</p>
          <p className="max-w-md text-sm leading-relaxed text-neutral-500">
            Explorez une zone à partir d&apos;une adresse, cliquez les parcelles qui vous intéressent, et
            ajoutez-les à votre projet.
          </p>
          <Button asChild size="sm">
            <Link href="/terrains/nouveau">Explorer un terrain</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-[18px]">
          {/* Tableau (recherche + tri, US-5.9) */}
          <div className="min-w-0 flex-[1_1_560px] overflow-x-auto">
            <TerrainsTable terrains={terrains} />
          </div>

          {/* Carte */}
          <div className="sticky top-[3.625rem] min-w-[320px] flex-[1_1_360px]">
            <div className="relative h-[520px] w-full overflow-hidden rounded-lg border border-border bg-neutral-100 shadow-sm">
              <DashboardMap terrains={terrains} className="absolute inset-0 h-full w-full" />
              <div className="absolute bottom-3 left-3 z-[1] rounded-lg border border-border bg-white/95 p-3 backdrop-blur-sm">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  Statut
                </div>
                <div className="flex flex-col gap-1.5">
                  {STATUS_LIST.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-xs text-neutral-700">
                      <StatusPin status={s.pin} className="h-2.5 w-2.5" />
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
