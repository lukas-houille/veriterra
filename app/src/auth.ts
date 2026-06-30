import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { bootstrapUserOrganisation } from './lib/bootstrap';

/**
 * Full Auth.js instance (Node runtime). The `jwt` callback runs the Prisma-backed
 * first-login bootstrap (see `bootstrapUserOrganisation`) and bakes the tenant context
 * into the token, so every later request carries `orgId` with no DB round-trip.
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
      }
      return token;
    },
  },
});
