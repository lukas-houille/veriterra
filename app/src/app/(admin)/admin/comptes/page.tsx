import type { Metadata } from 'next';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { listAccounts } from '@/modules/admin/service';
import { formatDate } from '@/modules/admin/format';

export const metadata: Metadata = { title: 'Administration · Comptes' };
export const dynamic = 'force-dynamic';

const th = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500';
const td = 'px-4 py-2.5 align-top text-sm text-foreground';

export default async function AdminComptesPage() {
  await requirePlatformAdmin();
  const accounts = await listAccounts();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Comptes</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          {accounts.length.toLocaleString('fr-FR')} compte{accounts.length > 1 ? 's' : ''} sur la plateforme.
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-neutral-500">
          Aucun compte.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-border bg-neutral-50">
              <tr>
                <th className={th}>E-mail</th>
                <th className={th}>Nom</th>
                <th className={th}>Organisations</th>
                <th className={`${th} text-right`}>Créé le</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-neutral-100 last:border-b-0">
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.email ?? <span className="italic text-neutral-400">non renseigné</span>}</span>
                      {a.platformAdmin && (
                        <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-indigo-500">
                          Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`${td} text-neutral-600`}>
                    {a.name ?? <span className="italic text-neutral-400">non renseigné</span>}
                  </td>
                  <td className={td}>
                    {a.memberships.length === 0 ? (
                      <span className="italic text-neutral-400">aucune</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {a.memberships.map((m, i) => (
                          <li key={i} className="text-neutral-700">
                            {m.organisation}{' '}
                            <span className="text-[11px] uppercase tracking-[0.04em] text-neutral-400">{m.role}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={`${td} text-right font-mono text-xs tabular-nums text-neutral-500`}>
                    {formatDate(a.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
