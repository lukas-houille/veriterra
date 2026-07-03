import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { bootstrapUserOrganisation, refreshTenantContext } from './lib/bootstrap';

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
        const ctx = await bootstrapUserOrganisation({
          sub: profile.sub,
          email: profile.email,
          name: profile.name,
        });
        token.userId = ctx.userId;
        token.orgId = ctx.orgId;
        token.role = ctx.role;
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
      return token;
    },
  },
});
