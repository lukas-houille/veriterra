import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Next 16 renamed the "middleware" convention to "proxy". Built from the edge-safe,
// Prisma-free config; the `authorized` callback default-denies, so every matched route
// requires a session.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect everything except: the Auth.js endpoints, the PUBLIC health check (used by
  // container/monitoring probes), Next internals, the sign-in page, and the PUBLIC PWA /
  // brand assets. These carry NO tenant data and MUST be served without an auth redirect
  // (a 302 would break service-worker registration, `cache.addAll`, manifest loading, and
  // the brand mark on the sign-in page). Each exclusion is dot-escaped and anchored with
  // `(?:/|$)` so a token matches ONLY its exact route (or subtree), never a mere prefix like
  // `/offline-queue` (which would otherwise silently bypass the auth gate, rule 2).
  matcher: [
    '/((?!(?:api/auth|api/health|_next/static|_next/image|favicon\\.ico|sign-in|offline|manifest\\.webmanifest|sw\\.js|icon\\.svg|apple-icon\\.png|icon-192\\.png|icon-512\\.png|icon-maskable-512\\.png|veriterra-mark\\.svg|veriterra-mark-dark\\.svg)(?:/|$)).*)',
  ],
};
