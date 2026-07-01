import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { listTerrains } from '@/modules/terrains/service';
import { Button, Card, StatusPin, type PortfolioStatus } from '@veriterra/ui';
import { DashboardMap } from '@/components/map/dashboard-map';

// Dashboard des terrains (Tranche 1, US-5.2). Composant serveur : lit la session
// (tenant garanti par proxy.ts) et charge les terrains de l'organisation en appelant
// directement le service (pas d'aller-retour HTTP). La carte est un composant client.

/** Libellé lisible du statut de portefeuille (français, sans tiret cadratin). */
const STATUS_LABELS: Record<string, string> = {
  A_ETUDIER: 'À étudier',
  PROMETTEUR: 'Prometteur',
  RESERVE: 'Réservé',
  ECARTE: 'Écarté',
};

/** Correspondance vers le statut attendu par StatusPin (@veriterra/ui). */
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

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const terrains = await listTerrains(session.user.orgId);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-neutral-200 bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/veriterra-mark.svg" alt="" width={32} height={32} className="rounded-md" />
            <span className="text-xl font-bold tracking-tight text-foreground">Veriterra</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button asChild>
              <Link href="/terrains/nouveau">Nouveau terrain</Link>
            </Button>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/sign-in' });
              }}
            >
              <Button type="submit" variant="secondary">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section>
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">
            Terrains suivis
          </h1>
          <p className="text-sm text-muted-foreground">
            {terrains.length === 0
              ? 'Aucun terrain pour le moment.'
              : `${surfaceFormat.format(terrains.length)} terrain${terrains.length > 1 ? 's' : ''} dans votre portefeuille.`}
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
            <p className="text-base font-semibold text-foreground">
              Votre portefeuille est vide
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Ajoutez un premier terrain à partir de son adresse pour générer sa synthèse
              foncière et le suivre ici.
            </p>
            <Button asChild>
              <Link href="/terrains/nouveau">Créer un terrain</Link>
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
                    <h2 className="font-semibold leading-tight text-foreground">
                      {terrain.label}
                    </h2>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <StatusPin status={statusPin(terrain.status)} />
                      <span className="text-xs font-medium text-muted-foreground">
                        {statusLabel(terrain.status)}
                      </span>
                    </span>
                  </div>
                  <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                    {terrain.address}
                  </p>
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
