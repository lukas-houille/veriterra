import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { bootstrapUserOrganisation, refreshTenantContext } from './lib/bootstrap';
import { isPlatformAdmin } from './lib/platform-admin';

/**
 * Full Auth.js instance (Node runtime). At sign-in the `jwt` callback runs the Prisma-backed
 * bootstrap (see `bootstrapUserOrganisation`); on every later request it re-reads the LIVE
 * membership and role from the database (`refreshTenantContext`), so removing a member or
 * changing a role takes effect immediately instead of persisting until the token expires.
 * This deliberately trades the earlier "no DB round-trip per request" optimisation for a
 * correct access-control revocation (one indexed lookup per authenticated request).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // account + profile are only present at sign-in.
      if (account && profile?.sub) {
        // N'accepter l'e-mail comme fondement d'un DROIT (rattachement d'invitation, éligibilité
        // admin) QUE s'il est VÉRIFIÉ par l'IdP (`email_verified`). Un e-mail non vérifié est
        // potentiellement contrôlé par l'attaquant : le prendre en compte laisserait rejoindre
        // l'organisation d'autrui via une invitation en attente, ou usurper une adresse de
        // l'allowlist admin (bris de la règle 2). Le bootstrap reçoit ce booléen et ne rattache
        // une invitation (ni ne persiste l'e-mail) que s'il est vrai.
        const emailVerified = (profile as { email_verified?: boolean }).email_verified === true;
        const ctx = await bootstrapUserOrganisation({
          sub: profile.sub,
          email: profile.email,
          emailVerified,
          name: profile.name,
        });
        token.userId = ctx.userId;
        token.orgId = ctx.orgId;
        token.role = ctx.role;
        // On conserve l'e-mail vérifié dans un champ dédié (jamais `token.email`, qui reste
        // l'affichage) pour recalculer le statut admin plateforme à chaque requête.
        const verifiedEmail = emailVerified && typeof profile.email === 'string' ? profile.email : undefined;
        token.platformEmail = verifiedEmail;
        token.platformAdmin = isPlatformAdmin(verifiedEmail);
        return token;
      }
      // Later requests: re-validate the live membership/role so revocation and role changes
      // are effective without a re-login. A user removed from their active org drops to another
      // membership, or loses tenant context entirely (orgId cleared => treated as unauthorised).
      if (typeof token.userId === 'string' && typeof token.orgId === 'string') {
        const ctx = await refreshTenantContext(token.userId, token.orgId);
        if (ctx) {
          token.orgId = ctx.orgId;
          token.role = ctx.role;
        } else {
          token.orgId = undefined;
          token.role = undefined;
        }
      }
      // Recalcul du statut admin plateforme à chaque requête (l'allowlist ADMIN_EMAILS peut changer
      // au déploiement) : comme le rôle d'org, il est re-validé sans re-login. `platformEmail` n'est
      // présent que s'il a été vérifié au sign-in, donc ce recalcul reste sûr.
      token.platformAdmin = isPlatformAdmin(
        typeof token.platformEmail === 'string' ? token.platformEmail : undefined,
      );
      return token;
    },
  },
});
