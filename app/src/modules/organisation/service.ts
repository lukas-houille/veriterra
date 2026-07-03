import { forOrg, withOrg } from '@veriterra/db';

// Lecture/écriture de l'organisation COURANTE (bloc Organisation du profil) et gestion des membres et
// invitations. Passe par les clients SCOPÉS RLS (`forOrg`/`withOrg`), jamais le client privilégié
// `admin` : l'isolation multi-tenant est imposée par Postgres (règle 2), pas seulement par le code.
// Membership, Organisation, User ET Invitation ont une policy RLS (User est scopé via Membership),
// donc toute jointure est filtrée par la base. `orgId` vient toujours de la session authentifiée
// (jamais d'une entrée client). Les invariants métier (dernier propriétaire, escalade de privilège)
// sont vérifiés ici et signalés par `OrgManageError` (avec un code HTTP), l'acceptation d'une
// invitation se faisant au login (voir `lib/bootstrap.ts`, voie privilégiée).

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface OrgMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: OrgRole;
}

export interface OrgInvitation {
  id: string;
  email: string;
  role: OrgRole;
  /** ISO 8601, pour l'affichage de la date d'invitation. */
  createdAt: string;
}

export interface OrgOverview {
  id: string;
  name: string;
  members: OrgMember[];
  /** Invitations encore en attente (PENDING), les acceptées/révoquées ne sont pas listées. */
  invitations: OrgInvitation[];
}

const MAX_ORG_NAME = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Erreur métier de gestion (règle violée), avec le code HTTP à renvoyer. Distingue une violation
 *  attendue (dernier propriétaire, privilège insuffisant, entrée invalide) d'une panne serveur. */
export class OrgManageError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'OrgManageError';
  }
}

function isManageableRole(role: string): role is OrgRole {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
}

/**
 * Organisation courante, ses membres et (seulement pour les gestionnaires) ses invitations en attente.
 * `orgId` = organisation de la session. `includeInvitations` NE doit être vrai que pour un OWNER/ADMIN :
 * les e-mails invités ne doivent pas être sérialisés vers un simple membre (fuite d'information).
 */
export async function getOrgOverview(orgId: string, includeInvitations = false): Promise<OrgOverview | null> {
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

  const pending = includeInvitations
    ? await db.invitation.findMany({
        where: { status: 'PENDING' },
        select: { id: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const invitations: OrgInvitation[] = pending.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as OrgRole,
    createdAt: i.createdAt.toISOString(),
  }));

  return { id: org.id, name: org.name, members, invitations };
}

/** Renomme l'organisation courante (borné). `orgId` = organisation de la session (jamais du client). */
export async function renameOrganisation(orgId: string, name: string): Promise<string> {
  const clean = name.trim().slice(0, MAX_ORG_NAME);
  if (!clean) throw new OrgManageError('Nom d\'organisation vide.');
  const updated = await withOrg(orgId, (tx) =>
    tx.organisation.update({ where: { id: orgId }, data: { name: clean }, select: { name: true } }),
  );
  return updated.name;
}

/**
 * Invite un e-mail à rejoindre l'organisation courante. Réservé aux rôles MEMBER/ADMIN (jamais OWNER :
 * un propriétaire n'est pas créé par invitation). Upsert sur (org, e-mail) : ré-inviter un e-mail
 * précédemment révoqué le remet en PENDING. L'e-mail est normalisé en minuscules (rattachement au
 * login insensible à la casse). Refuse d'inviter une personne DÉJÀ membre de l'organisation.
 */
export async function inviteMember(
  orgId: string,
  invitedByUserId: string,
  emailRaw: string,
  role: OrgRole,
): Promise<OrgInvitation> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new OrgManageError('Adresse e-mail invalide.');
  if (role !== 'MEMBER' && role !== 'ADMIN') {
    throw new OrgManageError('Une invitation ne peut donner que le rôle Membre ou Administrateur.');
  }

  return withOrg(orgId, async (tx) => {
    // Déjà membre ? User est scopé RLS à l'organisation courante (via Membership), donc un résultat
    // signifie bien « membre de CETTE organisation ». Comparaison insensible à la casse.
    const existing = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new OrgManageError('Cette personne est déjà membre de l\'organisation.', 409);

    const inv = await tx.invitation.upsert({
      where: { organisationId_email: { organisationId: orgId, email } },
      update: { role, status: 'PENDING', invitedByUserId, acceptedByUserId: null, acceptedAt: null },
      create: { organisationId: orgId, email, role, invitedByUserId },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    return { id: inv.id, email: inv.email, role: inv.role as OrgRole, createdAt: inv.createdAt.toISOString() };
  });
}

/** Révoque une invitation en attente (soft : passe en REVOKED). Sans effet si déjà acceptée/révoquée. */
export async function revokeInvitation(orgId: string, invitationId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    // RLS scope déjà à l'organisation courante : findUnique renvoie null hors org.
    const inv = await tx.invitation.findUnique({ where: { id: invitationId }, select: { status: true } });
    if (!inv) throw new OrgManageError('Invitation introuvable.', 404);
    if (inv.status !== 'PENDING') return;
    await tx.invitation.update({ where: { id: invitationId }, data: { status: 'REVOKED' } });
  });
}

/**
 * Change le rôle d'un membre. Seul un OWNER peut créer/modifier un OWNER (anti-escalade). Refuse de
 * rétrograder le DERNIER propriétaire (l'organisation resterait sans propriétaire). `actorRole` est le
 * rôle de la session appelante (déjà vérifié OWNER/ADMIN côté route).
 */
export async function changeMemberRole(
  orgId: string,
  actorRole: OrgRole,
  targetUserId: string,
  newRole: OrgRole,
): Promise<void> {
  if (!isManageableRole(newRole)) throw new OrgManageError('Rôle invalide.');
  await withOrg(orgId, async (tx) => {
    // Verrou de l'organisation le temps de la transaction : sérialise les changements de rôle/retraits
    // concurrents pour que le comptage des OWNER et l'écriture soient cohérents (garde « dernier
    // propriétaire » anti-TOCTOU en READ COMMITTED).
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId}::uuid FOR UPDATE`;
    const target = await tx.membership.findUnique({
      where: { userId_organisationId: { userId: targetUserId, organisationId: orgId } },
      select: { role: true },
    });
    if (!target) throw new OrgManageError('Membre introuvable.', 404);
    if ((target.role === 'OWNER' || newRole === 'OWNER') && actorRole !== 'OWNER') {
      throw new OrgManageError('Seul un propriétaire peut gérer le rôle Propriétaire.', 403);
    }
    if (target.role === 'OWNER' && newRole !== 'OWNER') {
      const owners = await tx.membership.count({ where: { organisationId: orgId, role: 'OWNER' } });
      if (owners <= 1) throw new OrgManageError('Impossible de rétrograder le dernier propriétaire.', 409);
    }
    await tx.membership.update({
      where: { userId_organisationId: { userId: targetUserId, organisationId: orgId } },
      data: { role: newRole },
    });
  });
}

/**
 * Retire un membre de l'organisation. Seul un OWNER peut retirer un OWNER, et jamais le DERNIER
 * propriétaire. `actorRole` = rôle de la session (déjà vérifié OWNER/ADMIN côté route).
 */
export async function removeMember(orgId: string, actorRole: OrgRole, targetUserId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    // Verrou de l'organisation (cf. changeMemberRole) : garde « dernier propriétaire » anti-TOCTOU.
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId}::uuid FOR UPDATE`;
    const target = await tx.membership.findUnique({
      where: { userId_organisationId: { userId: targetUserId, organisationId: orgId } },
      select: { role: true },
    });
    if (!target) throw new OrgManageError('Membre introuvable.', 404);
    if (target.role === 'OWNER') {
      if (actorRole !== 'OWNER') throw new OrgManageError('Seul un propriétaire peut retirer un propriétaire.', 403);
      const owners = await tx.membership.count({ where: { organisationId: orgId, role: 'OWNER' } });
      if (owners <= 1) throw new OrgManageError('Impossible de retirer le dernier propriétaire.', 409);
    }
    await tx.membership.delete({
      where: { userId_organisationId: { userId: targetUserId, organisationId: orgId } },
    });
  });
}
