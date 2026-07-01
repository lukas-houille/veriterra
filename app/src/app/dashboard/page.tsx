import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { listTerrains } from '@/modules/terrains/service';
import { getActiveProjet } from '@/modules/projet/service';
import { Button, Card, StatusPin, type PortfolioStatus } from '@veriterra/ui';
import { DashboardMap } from '@/components/map/dashboard-map';

// Tableau de bord des terrains du projet (Tranche 1, US-5.2). Composant serveur : lit la
// session (tenant garanti par proxy.ts), exige un projet (sinon onboarding), et charge les
// terrains de l'organisation directement via le service.

const STATUS_LABELS: Record<string, string> = {
  A_ETUDIER: 'À étudier',
  PROMETTEUR: 'Prometteur',
  RESERVE: 'Réservé',
  ECARTE: 'Écarté',
};

const STATUS_PINS: Record<string, PortfolioStatus> = {
  A_ETUDIER: 'à étudier',
  PROMETTEUR: 'prometteur',
  RESERVE: 'réservé',
  ECARTE: 'écarté',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusPin(status: string): PortfolioStatus {
  return STATUS_PINS[status] ?? 'à étudier';
}

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

  const terrains = await listTerrains(session.user.orgId);
  const resume = projetResume(projet);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-neutral-200 bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img src="/veriterra-mark.svg" alt="" width={32} height={32} className="rounded-md" />
            <span className="text-xl font-bold tracking-tight text-foreground">Veriterra</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Button asChild>
              <Link href="/terrains/nouveau">Explorer un terrain</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/onboarding">Mon projet</Link>
            </Button>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <Button type="submit" variant="ghost">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section>
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">
            Terrains du projet
          </h1>
          <p className="text-sm text-muted-foreground">
            {resume ? `${projet.name} : ${resume}.` : projet.name}
            {terrains.length > 0 &&
              ` ${surfaceFormat.format(terrains.length)} terrain${terrains.length > 1 ? 's' : ''}.`}
          </p>
        </section>

        <section>
          <DashboardMap
            terrains={terrains}
            className="h-[420px] w-full overflow-hidden rounded-lg border border-neutral-200 shadow-sm"
          />
        </section>

        {terrains.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-base font-semibold text-foreground">Aucun terrain pour le moment</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Explorez une zone à partir d&apos;une adresse, cliquez les parcelles qui vous
              intéressent, et ajoutez-les à votre projet.
            </p>
            <Button asChild>
              <Link href="/terrains/nouveau">Explorer un terrain</Link>
            </Button>
          </Card>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {terrains.map((terrain) => (
              <Link
                key={terrain.id}
                href={`/terrains/${terrain.id}`}
                className="block rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="h-full p-5 transition-colors hover:bg-neutral-50">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className="font-semibold leading-tight text-foreground">{terrain.label}</h2>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <StatusPin status={statusPin(terrain.status)} />
                      <span className="text-xs font-medium text-muted-foreground">
                        {statusLabel(terrain.status)}
                      </span>
                    </span>
                  </div>
                  <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{terrain.address}</p>
                  <dl className="flex items-end justify-between gap-3">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Surface totale
                      </dt>
                      <dd className="font-mono text-foreground">
                        {surfaceFormat.format(terrain.surfaceTotaleM2)} m²
                      </dd>
                    </div>
                    {terrain.prixDemande != null ? (
                      <div className="text-right">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Prix demandé
                        </dt>
                        <dd className="font-mono text-foreground">
                          {prixFormat.format(terrain.prixDemande)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </Card>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
