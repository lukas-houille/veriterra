import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getActiveProjet } from '@/modules/projet/service';
import { getOrgOverview, type OrgRole } from '@/modules/organisation/service';
import { ProjetForm } from './projet-form';
import { OrgSettings } from './org-settings';
import { OrgMembers } from './org-members';

// Section profil : le compte, le projet (critères qui pilotent le scoring, éditables) et
// l'organisation (nom, membres, invitations). Sous le shell (app). L'invitation par e-mail
// pré-autorise l'adhésion : l'invité rejoint l'organisation à sa prochaine connexion.

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

  const role = (session.user.role as OrgRole) ?? 'MEMBER';
  const canManageOrg = role === 'OWNER' || role === 'ADMIN';
  // `canManageOrg` conditionne le chargement des invitations : leurs e-mails ne sont sérialisés vers
  // le client que pour un OWNER/ADMIN (pas pour un simple membre).
  const [projet, org] = await Promise.all([
    getActiveProjet(orgId),
    getOrgOverview(orgId, canManageOrg),
  ]);

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
        description="Le nom de votre organisation, ses membres et les invitations en attente."
      >
        <div className="flex flex-col gap-5">
          <OrgSettings initialName={org?.name ?? ''} canManage={canManageOrg} />

          <OrgMembers
            members={org?.members ?? []}
            invitations={org?.invitations ?? []}
            canManage={canManageOrg}
            isOwner={role === 'OWNER'}
            currentUserId={session.user.id}
          />
        </div>
      </Section>
    </div>
  );
}
