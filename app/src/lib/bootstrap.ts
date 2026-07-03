import { admin, type Role } from '@veriterra/db';

export interface OidcProfileSubset {
  sub: string;
  email?: string | null;
  /** Vrai seulement si l'IdP a VÉRIFIÉ l'adresse (`email_verified`). Un e-mail non vérifié est
   *  potentiellement contrôlé par l'attaquant : il ne doit jamais résoudre un droit (voir plus bas). */
  emailVerified?: boolean;
  name?: string | null;
}

export interface TenantContext {
  userId: string;
  orgId: string;
  role: Role;
}

/**
 * Idempotent first-login bootstrap. Upserts the user keyed on the OIDC subject (never
 * the email, which is mutable), accepts any pending invitation matching the user's email,
 * and, only if the user still belongs to no organisation, silently creates their personal
 * organisation with an OWNER membership. Runs through the privileged `admin` client because
 * it crosses the tenant boundary by definition. Returns the tenant context the `jwt`
 * callback bakes into the token.
 *
 * SÉCURITÉ (règle 2) : l'e-mail n'est pris en compte (rattachement d'invitation ET persistance)
 * QUE s'il est VÉRIFIÉ par l'IdP. Un e-mail non vérifié est potentiellement contrôlé par
 * l'attaquant ; l'accepter laisserait rejoindre l'organisation d'autrui via une invitation en
 * attente (adhésion avec le rôle prévu, ADMIN possible). C'est la même frontière de confiance que
 * l'éligibilité admin plateforme, appliquée ici aussi. Un e-mail non vérifié est traité comme absent.
 */
export async function bootstrapUserOrganisation(profile: OidcProfileSubset): Promise<TenantContext> {
  const trustedEmail = profile.emailVerified && typeof profile.email === 'string' ? profile.email : null;

  const user = await admin.user.upsert({
    where: { oidcSubject: profile.sub },
    update: { email: trustedEmail, name: profile.name ?? null },
    create: {
      oidcSubject: profile.sub,
      email: trustedEmail,
      name: profile.name ?? null,
    },
  });

  await acceptPendingInvitations(user.id, trustedEmail);

  // Organisation active : la plus ANCIENNE adhésion (départage par organisationId pour rester
  // déterministe si deux adhésions partagent le même instant). Un utilisateur invité avant sa
  // première connexion n'a que l'organisation d'invitation : il y atterrit directement. Un utilisateur
  // existant garde son organisation personnelle (le sélecteur multi-organisations viendra ensuite).
  let membership = await admin.membership.findFirst({
    where: { userId: user.id },
    orderBy: [{ createdAt: 'asc' }, { organisationId: 'asc' }],
  });
  if (!membership) {
    const organisation = await admin.organisation.create({
      data: { name: user.email ?? user.oidcSubject },
    });
    membership = await admin.membership.create({
      data: { userId: user.id, organisationId: organisation.id, role: 'OWNER' },
    });
  }

  return { userId: user.id, orgId: membership.organisationId, role: membership.role };
}

/**
 * Re-résout le contexte tenant à CHAQUE requête (hors sign-in), à partir de l'adhésion VIVANTE en
 * base, pour que le RETRAIT d'un membre et le CHANGEMENT DE RÔLE prennent effet sans attendre le
 * re-login. Sans cela, `orgId` et `role`, figés dans le JWT au login, resteraient périmés : un membre
 * retiré garderait l'accès, un OWNER rétrogradé garderait ses pouvoirs, pendant toute la vie du token.
 * Si l'adhésion à l'organisation active a disparu (membre retiré), bascule sur l'adhésion la plus
 * ancienne restante ; sans aucune adhésion, renvoie null (plus d'accès tenant). Coût assumé : une
 * lecture indexée par requête authentifiée (on renonce à l'optimisation « zéro aller-retour »).
 */
export async function refreshTenantContext(userId: string, orgId: string): Promise<TenantContext | null> {
  const current = await admin.membership.findUnique({
    where: { userId_organisationId: { userId, organisationId: orgId } },
    select: { role: true },
  });
  if (current) return { userId, orgId, role: current.role };

  const fallback = await admin.membership.findFirst({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { organisationId: 'asc' }],
    select: { organisationId: true, role: true },
  });
  if (fallback) return { userId, orgId: fallback.organisationId, role: fallback.role };
  return null;
}

/**
 * Accepte au login les invitations PENDING adressées à l'e-mail de l'utilisateur (comparaison en
 * minuscules, l'e-mail des invitations étant stocké en minuscules). Crée l'adhésion avec le rôle de
 * l'invitation (sans écraser une adhésion déjà présente) et marque l'invitation ACCEPTED. Franchit la
 * frontière tenant, donc via le rôle privilégié `admin`. Sans e-mail, aucun rattachement possible.
 * PRÉCONDITION DE SÉCURITÉ : l'e-mail reçu ici doit déjà être VÉRIFIÉ (l'appelant `bootstrapUser-
 * Organisation` passe `null` pour un e-mail non vérifié), sinon un attaquant rejoindrait l'org d'autrui.
 */
async function acceptPendingInvitations(userId: string, email?: string | null): Promise<void> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return;

  const pending = await admin.invitation.findMany({
    where: { email: normalized, status: 'PENDING' },
  });
  for (const invitation of pending) {
    await admin.membership.upsert({
      where: { userId_organisationId: { userId, organisationId: invitation.organisationId } },
      update: {},
      create: { userId, organisationId: invitation.organisationId, role: invitation.role },
    });
    await admin.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedByUserId: userId, acceptedAt: new Date() },
    });
  }
}
