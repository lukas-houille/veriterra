import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load the repo-root .env for local runs (no-op in CI where the env is already set).
config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

export default defineConfig({
  resolve: {
    // Résout l'alias `@/…` (tsconfig paths) pour les tests comme pour le build Next.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
