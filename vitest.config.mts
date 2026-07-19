import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'shared/src/**/*.test.ts',
      'contexts/**/src/**/*.test.ts',
      'contexts/**/tests/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: [
        'shared/src/**/*.ts',
        'contexts/**/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/composition.ts',
        '**/handlers/**',
      ],
      thresholds: {
        // Bootstrap thresholds. Raise these as coverage expands; track in
        // ADRs + per-PR coverage diff. Final target is 80/80/70/80.
        lines: 35,
        functions: 30,
        branches: 40,
        statements: 35,
      },
    },
    setupFiles: ['./tests/setup.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
});
