import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js configuration: providers + lightweight callbacks only, NO Prisma.
 * This is imported by `middleware.ts` (which runs on the edge runtime where Prisma
 * cannot run). All database work lives in `auth.ts` (Node runtime).
 *
 * Pocket ID exposes standard OIDC discovery, so we only pass `issuer`; Auth.js fetches
 * `${issuer}/.well-known/openid-configuration` and enables PKCE + state by default.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 },
  pages: { signIn: '/sign-in' },
  providers: [
    {
      id: 'pocket-id',
      name: 'Pocket ID',
      type: 'oidc',
      issuer: process.env.AUTH_POCKET_ID_ISSUER,
      clientId: process.env.AUTH_POCKET_ID_ID,
      clientSecret: process.env.AUTH_POCKET_ID_SECRET,
      authorization: { params: { scope: 'openid profile email' } },
    },
  ],
  callbacks: {
    // Landing publique à la racine ; tout le reste est default-deny (session requise).
    authorized({ auth, request }) {
      if (request.nextUrl.pathname === '/') return true;
      return !!auth?.user;
    },
    // Surface the tenant context baked into the token (by the Node `jwt` callback) onto
    // the session so server code can scope queries with `forOrg(session.user.orgId)`.
    session({ session, token }) {
      const t = token as { userId?: string; orgId?: string; role?: string; platformAdmin?: boolean };
      if (t.userId) session.user.id = t.userId;
      if (t.orgId) session.user.orgId = t.orgId;
      if (t.role) session.user.role = t.role;
      session.user.platformAdmin = t.platformAdmin === true;
      return session;
    },
  },
} satisfies NextAuthConfig;
