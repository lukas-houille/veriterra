import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertChip,
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
import type { PrixDvfData, RisquesData } from '@veriterra/enrichment';
import { auth } from '@/auth';
import { getTerrain, getTerrainEnrichment } from '@/modules/terrains/service';
import { listDocuments } from '@/modules/terrains/documents';
import { maxUploadMbForDisplay } from '@/lib/storage/s3';
import type { EnrichmentBlockView } from '@/modules/terrains/types';
import { EditTerrainForm } from './edit-terrain-form';
import { EnrichmentActions } from './enrichment-actions';
import { DocumentsPanel } from './documents-panel';

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

const CONFIDENCE_LABEL: Record<string, string> = {
  ELEVEE: 'élevée',
  MOYENNE: 'moyenne',
  FAIBLE: 'faible',
};

function BlockHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {meta ? <span className="font-mono text-[11px] text-neutral-400">{meta}</span> : null}
    </div>
  );
}

/** Rend le bloc RISQUES (Géorisques) selon son statut : chargement, erreur, indisponible ou données. */
function RisquesBlock({ block }: { block: EnrichmentBlockView }) {
  const title = 'Risques';
  if (block.status === 'PENDING') {
    return (
      <section aria-busy="true">
        <BlockHeader title={title} />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-neutral-100" />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Chargement des risques...</p>
      </section>
    );
  }
  if (block.status === 'ERROR') {
    return (
      <section>
        <BlockHeader title={title} />
        <UnavailableState label="Récupération impossible pour l'instant, réessayez avec Actualiser" />
      </section>
    );
  }
  if (block.status === 'UNAVAILABLE' || !block.data) {
    return (
      <section>
        <BlockHeader title={title} />
        <UnavailableState label="Aucun risque disponible pour cette parcelle" />
      </section>
    );
  }
  const risques = block.data as RisquesData;
  const meta = [
    block.source,
    block.fetchedAt ? formatDate(block.fetchedAt) : null,
    block.confidence ? `confiance ${CONFIDENCE_LABEL[block.confidence] ?? block.confidence.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section>
      <BlockHeader title={title} meta={meta} />
      <div className="grid gap-3 sm:grid-cols-2">
        {risques.items.map((item) => (
          <div key={item.key} className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{item.label}</p>
            <div className="mt-1.5">
              {item.available && item.value ? (
                item.severity ? (
                  <AlertChip severity={item.severity}>{item.value}</AlertChip>
                ) : (
                  <p className="text-sm text-foreground">{item.value}</p>
                )
              ) : (
                <UnavailableState />
              )}
            </div>
          </div>
        ))}
      </div>
      {block.sourceUrl ? (
        <p className="mt-2 text-[10.5px] text-neutral-400">
          Source ·{' '}
          <a href={block.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {block.source ?? 'Géorisques'}
          </a>
        </p>
      ) : null}
    </section>
  );
}

function formatEcart(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `${pct > 0 ? '+' : ''}${pct} % vs estimation`;
}

/** Rend le bloc PRIX_DVF selon son statut. Calcule l'estimation du terrain et l'écart au prix demandé. */
function PrixDvfBlock({
  block,
  prixDemande,
  surfaceM2,
}: {
  block: EnrichmentBlockView;
  prixDemande: number | null;
  surfaceM2: number;
}) {
  const title = 'Prix (DVF)';
  if (block.status === 'PENDING') {
    return (
      <section aria-busy="true">
        <BlockHeader title={title} />
        <div className="h-20 animate-pulse rounded-lg border border-border bg-neutral-100" />
        <p className="mt-2 text-xs text-muted-foreground">Recherche des comparables...</p>
      </section>
    );
  }
  if (block.status === 'ERROR') {
    return (
      <section>
        <BlockHeader title={title} />
        <UnavailableState label="Récupération impossible pour l'instant, réessayez avec Actualiser" />
      </section>
    );
  }
  const data = block.data as PrixDvfData | null;
  if (block.status === 'UNAVAILABLE' || !data || data.estimationM2 == null) {
    return (
      <section>
        <BlockHeader title={title} />
        <UnavailableState label={data?.note ?? 'Estimation DVF indisponible'} />
      </section>
    );
  }

  const estimationTotale = data.estimationM2 * surfaceM2;
  const ecart = prixDemande != null && estimationTotale > 0 ? (prixDemande - estimationTotale) / estimationTotale : null;
  const meta = [
    block.source,
    block.fetchedAt ? formatDate(block.fetchedAt) : null,
    block.confidence ? `confiance ${CONFIDENCE_LABEL[block.confidence] ?? block.confidence.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section>
      <BlockHeader title={title} meta={meta} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Estimation du terrain</p>
          <p className="mt-1 font-mono text-lg text-foreground">{nfPrix.format(estimationTotale)}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            environ {nfSurface.format(data.estimationM2)} €/m² (de {nfSurface.format(data.fourchetteBasseM2 ?? 0)} à{' '}
            {nfSurface.format(data.fourchetteHauteM2 ?? 0)} €/m²)
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {data.nbComparables} vente{data.nbComparables > 1 ? 's' : ''} de terrain comparable
            {data.nbComparables > 1 ? 's' : ''}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Écart au prix demandé</p>
          <div className="mt-1.5">
            {prixDemande == null ? (
              <UnavailableState label="Prix demandé non renseigné" />
            ) : ecart != null ? (
              <AlertChip severity={ecart > 0.1 ? 'warning' : ecart < -0.1 ? 'success' : 'info'}>
                {formatEcart(ecart)}
              </AlertChip>
            ) : (
              <span className="text-sm text-neutral-500">non calculable</span>
            )}
          </div>
        </div>
      </div>
      {data.dernieresVentes.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Dernières ventes de terrain
          </p>
          <ul className="flex flex-col gap-0.5 font-mono text-xs text-neutral-600">
            {data.dernieresVentes.map((v) => (
              <li key={`${v.date}-${v.surfaceM2}-${v.valeur}`}>
                {formatDate(v.date)} · {nfSurface.format(v.surfaceM2)} m² · {nfSurface.format(v.prixM2)} €/m²
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {block.sourceUrl ? (
        <p className="mt-2 text-[10.5px] text-neutral-400">
          Source ·{' '}
          <a href={block.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {block.source ?? 'DVF'}
          </a>
        </p>
      ) : null}
    </section>
  );
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

  const enrichment = await getTerrainEnrichment(session.user.orgId, id);
  const documents = await listDocuments(session.user.orgId, id);
  const maxUploadMb = maxUploadMbForDisplay();

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
            href="/dashboard"
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

        {/* Édition des champs manuels et du statut (US-1.9). */}
        <div className="mb-6">
          <EditTerrainForm
            key={terrain.id}
            terrainId={terrain.id}
            initial={{
              label: terrain.label,
              address: terrain.address,
              status: terrain.status,
              prixDemande: terrain.prixDemande,
              lienAnnonce: terrain.lienAnnonce,
              notes: terrain.notes,
            }}
          />
        </div>

        {/* Progressive disclosure (US-1.4) : aperçu rassurant par défaut, détail derrière onglets. */}
        <Tabs defaultValue="apercu">
          <TabsList>
            <TabsTrigger value="apercu">Aperçu</TabsTrigger>
            <TabsTrigger value="enrichissement">Enrichissement</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
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

          {/* ----- Onglet Enrichissement : blocs sourcés, chargés en arrière-plan ----- */}
          <TabsContent value="enrichissement">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Données sourcées, chargées automatiquement en arrière-plan.
                </p>
                <EnrichmentActions terrainId={terrain.id} pending={enrichment.anyPending} />
              </div>

              {enrichment.blocks.map((block) => {
                if (block.type === 'PRIX_DVF')
                  return (
                    <PrixDvfBlock
                      key={block.type}
                      block={block}
                      prixDemande={terrain.prixDemande}
                      surfaceM2={terrain.surfaceTotaleM2}
                    />
                  );
                if (block.type === 'RISQUES') return <RisquesBlock key={block.type} block={block} />;
                return null;
              })}

              {/* Blocs à venir dans les prochaines slices (jamais silencieux, règle n°3). */}
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { key: 'plu', title: 'PLU' },
                  { key: 'pente', title: 'Pente et services' },
                ].map((item) => (
                  <div key={item.key}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {item.title}
                    </p>
                    <UnavailableState label="À venir" />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ----- Onglet Documents : photos et pièces jointes (US-5.3, US-5.8) ----- */}
          <TabsContent value="documents">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Photos et documents rattachés au terrain (étude de sol, bornage, certificat
                d'urbanisme, devis, diagnostic). Chaque pièce porte sa provenance et sa date.
              </p>
              <DocumentsPanel terrainId={terrain.id} documents={documents} maxUploadMb={maxUploadMb} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
