import type { NextConfig } from 'next';

// Identifiant de build exposé au client (bust du cache du service worker, US-6.1). Un SHA de
// commit si le build le fournit, sinon l'horodatage du build : stable au sein d'un build, distinct
// d'un déploiement à l'autre, ce qui suffit à faire tourner le cache versionné du SW.
const swVersion = process.env.SOURCE_COMMIT ?? String(Date.now());

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SW_VERSION: swVersion },
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
