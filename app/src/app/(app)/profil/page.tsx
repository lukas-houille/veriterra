import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getActiveProjet } from '@/modules/projet/service';
import { getOrgOverview, type OrgRole } from '@/modules/organisation/service';
import { ProjetForm } from './projet-form';
import { OrgSettings } from './org-settings';

// Section profil : le compte, le projet (critères qui pilotent le scoring, éditables) et
// l'organisation (nom + membres). Sous le shell (app). L'invitation de membres arrive dans une
// slice dédiée (pré-autorisation par e-mail + multi-org), non incluse ici.

export const metadata = { title: 'Profil · Veriterra' };

const ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="m-0 text-lg font-bold tracking-[-0.01em] text-foreground">{title}</h2>
      {description && <p className="mb-5 mt-1 text-sm text-neutral-500">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-neutral-500">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect('/sign-in');
  const orgId = session.user.orgId;

  const [projet, org] = await Promise.all([getActiveProjet(orgId), getOrgOverview(orgId)]);
  const role = (session.user.role as OrgRole) ?? 'MEMBER';
  const canManageOrg = role === 'OWNER' || role === 'ADMIN';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="m-0 text-2xl font-extrabold tracking-[-0.02em] text-foreground">Profil</h1>
        <p className="mt-1 text-sm text-neutral-500">Votre compte, votre projet et votre organisation.</p>
      </div>

      <Section title="Compte">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" value={session.user.name ?? 'Non renseigné'} />
          <Field label="E-mail" value={session.user.email ?? 'Non renseigné'} />
          <Field label="Organisation" value={org?.name ?? 'Non renseignée'} />
          <Field label="Rôle" value={ROLE_LABEL[role] ?? role} />
        </div>
      </Section>

      <Section
        title="Projet"
        description="Les critères de votre recherche. Vos terrains sont notés et comparés selon ce projet."
      >
        <ProjetForm initial={projet} />
      </Section>

      <Section
        title="Organisation"
        description="Le nom de votre organisation et ses membres. L'invitation de nouveaux membres arrive bientôt."
      >
        <div className="flex flex-col gap-5">
          <OrgSettings initialName={org?.name ?? ''} canManage={canManageOrg} />

          <div>
            <div className="mb-2 text-xs font-semibold text-neutral-500">
              Membres ({org?.members.length ?? 0})
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {(org?.members ?? []).map((m) => (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5"
                >
                  <span className="text-sm text-foreground">
                    {m.name ?? m.email ?? 'Membre'}
                    {m.userId === session.user.id && (
                      <span className="ml-2 text-xs text-neutral-500">(vous)</span>
                    )}
                    {m.email && m.name && <span className="ml-2 text-xs text-neutral-500">{m.email}</span>}
                  </span>
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-500">
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
