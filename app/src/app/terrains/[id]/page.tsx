import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  type BadgeProps,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataBlock,
  StatusPin,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UnavailableState,
  type PortfolioStatus,
} from '@veriterra/ui';
import { auth } from '@/auth';
import { getTerrain } from '@/modules/terrains/service';

// Fiche terrain (US-1.3 données rapides + amorce US-1.4 progressive disclosure).
// Composant serveur : appelle directement le service (pas d'aller-retour HTTP), l'isolation
// tenant est portée par `session.user.orgId` transmis au service (RLS).

/** Statuts portefeuille tels que stockés (enum) vers le libellé attendu par StatusPin. */
const STATUS_PIN: Record<string, PortfolioStatus> = {
  A_ETUDIER: 'à étudier',
  PROMETTEUR: 'prometteur',
  RESERVE: 'réservé',
  ECARTE: 'écarté',
};

/** Libellé français lisible du statut. */
const STATUS_LABEL: Record<string, string> = {
  A_ETUDIER: 'À étudier',
  PROMETTEUR: 'Prometteur',
  RESERVE: 'Réservé',
  ECARTE: 'Écarté',
};

/** Teinte sémantique du badge par statut (design-system §2, statuts portefeuille). */
const STATUS_BADGE: Record<string, NonNullable<BadgeProps['variant']>> = {
  A_ETUDIER: 'neutral',
  PROMETTEUR: 'success',
  RESERVE: 'warning',
  ECARTE: 'danger',
};

/** Icônes inline (trait 1.5, cohérent Lucide) : le paquet lucide-react n'est pas installé côté app. */
function ArrowLeftIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

const nfSurface = new Intl.NumberFormat('fr-FR');
const nfPrix = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const nfDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatSurface(m2: number): string {
  return `${nfSurface.format(m2)} m²`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'date inconnue' : nfDate.format(d);
}

export default async function TerrainPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  // Les pages sont protégées (proxy.ts) : une session est garantie. Ce garde-fou
  // satisfait le typage strict et évite tout accès sans contexte tenant.
  if (!session?.user) {
    notFound();
  }
  const terrain = await getTerrain(session.user.orgId, id);
  if (!terrain) {
    notFound();
  }

  const statusPin = STATUS_PIN[terrain.status] ?? 'à étudier';
  const statusLabel = STATUS_LABEL[terrain.status] ?? terrain.status;
  const statusVariant = STATUS_BADGE[terrain.status] ?? 'neutral';
  const createdLabel = formatDate(terrain.createdAt);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        {/* En-tête */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm text-indigo-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeftIcon />
            Retour au tableau de bord
          </Link>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {terrain.label}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{terrain.address}</p>
            </div>
            <span className="inline-flex items-center gap-2">
              <StatusPin status={statusPin} />
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </span>
          </div>
        </div>

        {/* Progressive disclosure (US-1.4) : aperçu rassurant par défaut, détail derrière onglets. */}
        <Tabs defaultValue="apercu">
          <TabsList>
            <TabsTrigger value="apercu">Aperçu</TabsTrigger>
            <TabsTrigger value="enrichissement">Enrichissement</TabsTrigger>
          </TabsList>

          {/* ----- Onglet Aperçu : données rapides sourcées ----- */}
          <TabsContent value="apercu">
            <div className="flex flex-col gap-6">
              {/* Surface et prix */}
              <div className="grid gap-4 sm:grid-cols-2">
                <DataBlock
                  label="Surface totale"
                  value={formatSurface(terrain.surfaceTotaleM2)}
                  source="Cadastre"
                  date={createdLabel}
                  confidence="élevée"
                />
                {terrain.prixDemande != null ? (
                  <DataBlock
                    label="Prix demandé"
                    value={nfPrix.format(terrain.prixDemande)}
                    source="Annonce"
                    date={createdLabel}
                    confidence="moyenne"
                  />
                ) : (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Prix demandé
                    </p>
                    <UnavailableState />
                  </div>
                )}
              </div>

              {/* Parcelles */}
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  Parcelles ({terrain.parcelles.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {terrain.parcelles.map((p) => (
                    <Card key={p.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {p.commune} · {p.section} {p.numero}
                        </CardTitle>
                        <p className="font-mono text-xs text-neutral-500">IDU {p.idu}</p>
                      </CardHeader>
                      <CardContent>
                        <DataBlock
                          label="Surface"
                          value={formatSurface(p.surfaceM2)}
                          source="Cadastre"
                          date={createdLabel}
                          confidence="élevée"
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              {/* Lien annonce et notes */}
              {(terrain.lienAnnonce || terrain.notes) && (
                <section className="flex flex-col gap-4">
                  {terrain.lienAnnonce ? (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Annonce
                      </p>
                      <a
                        href={terrain.lienAnnonce}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-indigo-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Voir l'annonce
                        <ExternalLinkIcon />
                      </a>
                    </div>
                  ) : null}
                  {terrain.notes ? (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Notes
                      </p>
                      <p className="whitespace-pre-line text-sm text-foreground">
                        {terrain.notes}
                      </p>
                    </div>
                  ) : null}
                </section>
              )}
            </div>
          </TabsContent>

          {/* ----- Onglet Enrichissement : à venir (règle n°3, jamais silencieux) ----- */}
          <TabsContent value="enrichissement">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { key: 'plu', title: 'PLU' },
                { key: 'risques', title: 'Risques' },
                { key: 'dvf', title: 'Prix DVF' },
              ].map((item) => (
                <div key={item.key}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {item.title}
                  </p>
                  <UnavailableState label="Donnée indisponible, enrichissement à venir" />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
