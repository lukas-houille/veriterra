import type { NextConfig } from 'next';

// Identifiant de build exposé au client (bust du cache du service worker, US-6.1). Un SHA de
// commit si le build le fournit, sinon l'horodatage du build : stable au sein d'un build, distinct
// d'un déploiement à l'autre, ce qui suffit à faire tourner le cache versionné du SW.
const swVersion = process.env.SOURCE_COMMIT ?? String(Date.now());

// En-têtes de sécurité (audit sécurité, finding LOW). Objectif principal : empêcher le CADRAGE de
// l'app dans une iframe tierce (clickjacking sur des actions à un clic comme « Retirer un membre » ou
// « Supprimer le terrain »). `X-Frame-Options: DENY` est universel et n'entre pas en conflit avec la
// CSP stricte propre à la route de download (`default-src 'none'; sandbox`, qui, elle, ne pose pas cet
// en-tête). Une CSP complète des pages (script-src/style-src, avec `frame-ancestors`) reste un
// durcissement ultérieur (à valider contre MapLibre/Next). HSTS sans includeSubDomains/preload (prudent).
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SW_VERSION: swVersion },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Tranche 0 runs the app via `next start` in a single (fat) image; standalone slimming
  // is a documented follow-up.
  // @veriterra/shared is plain TS source, so Next transpiles it. @veriterra/db is built to JS
  // and kept EXTERNAL (below) because it embeds the Prisma 7 client (wasm + dynamic
  // requires) which must not be bundled.
  transpilePackages: ['@veriterra/shared', '@veriterra/ui', '@veriterra/enrichment'],
  // Server-only / native packages required at runtime from node_modules, never bundled.
  serverExternalPackages: [
    '@veriterra/db',
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    'bullmq',
    'ioredis',
  ],
};

export default nextConfig;
