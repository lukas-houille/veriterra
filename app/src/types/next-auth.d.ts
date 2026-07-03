import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      orgId: string;
      role: string;
      /** Admin PLATEFORME (allowlist ADMIN_EMAILS), distinct du rôle d'organisation. */
      platformAdmin: boolean;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    orgId?: string;
    role?: string;
    /** E-mail OIDC VÉRIFIÉ (email_verified), conservé pour l'éligibilité admin plateforme uniquement. */
    platformEmail?: string;
    /** Admin plateforme, recalculé à chaque requête depuis `platformEmail` et l'allowlist ADMIN_EMAILS. */
    platformAdmin?: boolean;
  }
}
