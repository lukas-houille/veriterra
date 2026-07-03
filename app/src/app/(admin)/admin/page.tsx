import type { Metadata } from 'next';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { getPlatformStats, getSystemHealth } from '@/modules/admin/service';
import { formatBytes } from '@/modules/admin/format';

export const metadata: Metadata = { title: "Administration · Vue d'ensemble" };
// Données vivantes : jamais mises en cache statiquement.
export const dynamic = 'force-dynamic';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`}
        />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className="font-mono text-xs tabular-nums text-neutral-500">{detail}</span>
    </div>
  );
}

export default async function AdminOverviewPage() {
  await requirePlatformAdmin();
  // Découplé : un échec des compteurs (DB indisponible) ne doit PAS empêcher le panneau de santé
  // de s'afficher (il est justement là pour signaler la panne). Les compteurs passent alors en
  // « indisponible » (règle 3, jamais un 0 inventé) ; getSystemHealth ne rejette jamais.
  const [statsResult, health] = await Promise.all([
    getPlatformStats().then(
      (v) => ({ ok: true as const, v }),
      (err: unknown) => {
        console.error('[admin] platform stats failed:', err);
        return { ok: false as const };
      },
    ),
    getSystemHealth(),
  ]);
  const s = statsResult.ok ? statsResult.v : null;

  const workerDetail =
    health.workerLastBeatAgeMs === null
      ? 'indisponible'
      : `dernier signal il y a ${Math.round(health.workerLastBeatAgeMs / 1000)} s`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Vue d&apos;ensemble</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Compteurs et santé de la plateforme (toutes organisations).</p>
      </div>

      <section aria-label="Compteurs" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Organisations" value={s ? s.organisations.toLocaleString('fr-FR') : 'indisponible'} />
        <StatCard label="Comptes" value={s ? s.comptes.toLocaleString('fr-FR') : 'indisponible'} />
        <StatCard label="Terrains" value={s ? s.terrains.toLocaleString('fr-FR') : 'indisponible'} />
        <StatCard label="Documents" value={s ? s.documents.toLocaleString('fr-FR') : 'indisponible'} />
        <StatCard label="Volume documents" value={s ? formatBytes(s.documentsBytes) : 'indisponible'} />
        <StatCard
          label="Invitations en attente"
          value={s ? s.invitationsEnAttente.toLocaleString('fr-FR') : 'indisponible'}
        />
      </section>

      <section aria-label="Santé système">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Santé système</h2>
        <div className="rounded-lg border border-border bg-card px-4 shadow-sm">
          <HealthRow label="Base de données" ok={health.db} detail={health.db ? 'joignable' : 'indisponible'} />
          <HealthRow label="Redis" ok={health.redis} detail={health.redis ? 'joignable' : 'indisponible'} />
          <HealthRow label="Worker" ok={health.workerAlive} detail={workerDetail} />
        </div>
      </section>
    </div>
  );
}
