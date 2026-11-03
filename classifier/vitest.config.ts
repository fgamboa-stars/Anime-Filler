import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Each integration test boots its own in-process Postgres.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
