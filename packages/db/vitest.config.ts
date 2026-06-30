import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load the repo-root .env for local runs. In CI the env is already set and the file is
// absent: config() then no-ops and never overrides existing process.env values.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Run serially in one process: the RLS tests rely on a per-transaction GUC and must
    // not interleave across workers sharing the same database.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
