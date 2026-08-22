import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // coTuongCheck is a standalone console script, not a vitest suite — run via `npx tsx`
    exclude: ['tests/coTuongCheck.test.ts'],
    // Single fork, sequential files: suites share a temp SQLite file via
    // tests/_bootstrap.ts which stores the Express app on globalThis.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['**/*.test.ts', 'server/roomManager.ts', 'server/db.ts'],
    },
  },
});
