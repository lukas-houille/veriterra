import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tranche 0 runs the app via `next start` in a single (fat) image; standalone slimming
  // is a documented follow-up.
  // @veriterra/shared is plain TS source, so Next transpiles it. @veriterra/db is built to JS
  // and kept EXTERNAL (below) because it embeds the Prisma 7 client (wasm + dynamic
  // requires) which must not be bundled.
  transpilePackages: ['@veriterra/shared'],
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
