import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Next 16 renamed the "middleware" convention to "proxy". Built from the edge-safe,
// Prisma-free config; the `authorized` callback default-denies, so every matched route
// requires a session.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect everything except: the Auth.js endpoints, the PUBLIC health check (used by
  // container/monitoring probes), Next internals, and the sign-in page.
  matcher: ['/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|sign-in).*)'],
};
