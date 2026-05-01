import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/types.ts',
        'packages/*/src/**/*.test.ts',
        'packages/*/dist/**',
        'packages/*/schemas/*.schema.json',
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
        perFile: true,
      },
    },
  },
});
