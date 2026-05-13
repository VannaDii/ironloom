import { defineConfig } from 'vitest/config';

/**
 * Workspace package export condition that points at TypeScript sources.
 */
const workspaceSourceCondition = 'source';

/**
 * Node-side package conditions used by Vitest before workspace dist exists.
 */
const workspaceResolveConditions = [workspaceSourceCondition, 'module', 'node'];

/**
 * External package conditions used when Vitest decides a dependency can stay external.
 */
const workspaceExternalResolveConditions = [
  workspaceSourceCondition,
  'node',
  'module-sync',
];

export default defineConfig({
  resolve: {
    conditions: workspaceResolveConditions,
    tsconfigPaths: true,
  },
  ssr: {
    resolve: {
      conditions: workspaceResolveConditions,
      externalConditions: workspaceExternalResolveConditions,
    },
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
