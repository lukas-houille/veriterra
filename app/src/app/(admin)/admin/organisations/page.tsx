import type { Metadata } from 'next';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { listOrganisations } from '@/modules/admin/service';
import { formatDate } from '@/modules/admin/format';

export const metadata: Metadata = { title: 'Administration · Organisations' };
export const dynamic = 'force-dynamic';

const th = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500';
const thNum = `${th} text-right`;
const td = 'px-4 py-2.5 text-sm text-foreground';
const tdNum = `${td} text-right font-mono tabular-nums`;

export default async function AdminOrganisationsPage() {
  await requirePlatformAdmin();
  const orgs = await listOrganisations();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Organisations</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          {orgs.length.toLocaleString('fr-FR')} organisation{orgs.length > 1 ? 's' : ''} sur la plateforme.
        </p>
      </div>

      {orgs.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-neutral-500">
          Aucune organisation.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full min-w-[560px] border-collapse">
            <thead className="border-b border-border bg-neutral-50">
              <tr>
                <th className={th}>Nom</th>
                <th className={thNum}>Membres</th>
                <th className={thNum}>Terrains</th>
                <th className={thNum}>Documents</th>
                <th className={thNum}>Créée le</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-b border-neutral-100 last:border-b-0">
                  <td className={`${td} font-semibold`}>{o.name}</td>
                  <td className={tdNum}>{o.members.toLocaleString('fr-FR')}</td>
                  <td className={tdNum}>{o.terrains.toLocaleString('fr-FR')}</td>
                  <td className={tdNum}>{o.documents.toLocaleString('fr-FR')}</td>
                  <td className={`${tdNum} text-neutral-500`}>{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
