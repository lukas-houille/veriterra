import { forOrg, withOrg } from '@veriterra/db';

// Lecture/écriture de l'organisation COURANTE (bloc Organisation du profil). Passe par les clients
// SCOPÉS RLS (`forOrg`/`withOrg`), jamais le client privilégié `admin` : l'isolation multi-tenant
// est imposée par Postgres (règle 2), pas seulement par le code. Membership, Organisation ET User
// ont une policy RLS (User est scopé via Membership), donc la jointure membres est filtrée par la
// base. `orgId` vient toujours de la session authentifiée (jamais d'une entrée client).

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface OrgMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: OrgRole;
}

export interface OrgOverview {
  id: string;
  name: string;
  members: OrgMember[];
}

const MAX_ORG_NAME = 120;

/** Organisation courante + ses membres (nom/email/rôle), triés par ancienneté d'adhésion. */
export async function getOrgOverview(orgId: string): Promise<OrgOverview | null> {
  const db = forOrg(orgId);

  const org = await db.organisation.findUnique({ where: { id: orgId }, select: { id: true, name: true } });
  if (!org) return null;

  const memberships = await db.membership.findMany({
    where: { organisationId: orgId },
    select: { userId: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  const users = await db.user.findMany({
    where: { id: { in: memberships.map((m) => m.userId) } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const members: OrgMember[] = memberships.map((m) => {
    const u = byId.get(m.userId);
    return { userId: m.userId, name: u?.name ?? null, email: u?.email ?? null, role: m.role as OrgRole };
  });
  return { id: org.id, name: org.name, members };
}

/** Renomme l'organisation courante (borné). `orgId` = organisation de la session (jamais du client). */
export async function renameOrganisation(orgId: string, name: string): Promise<string> {
  const clean = name.trim().slice(0, MAX_ORG_NAME);
  if (!clean) throw new Error('Nom d\'organisation vide.');
  const updated = await withOrg(orgId, (tx) =>
    tx.organisation.update({ where: { id: orgId }, data: { name: clean }, select: { name: true } }),
  );
  return updated.name;
}
