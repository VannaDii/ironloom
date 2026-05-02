import { describe, expect, it } from 'vitest';

import {
  createDefaultArtifactRegistry,
  createArtifactRegistry,
  describeArtifactRegistry,
  recordArtifactMigration,
  registerArtifactType,
} from './logic.js';
import type { ArtifactRegistry } from './codec.js';

const baseRegistry: ArtifactRegistry = {
  registryId: ' artifacts-main ',
  version: 1,
  repositoryKey: ' repo-main ',
  entries: [
    {
      artifactType: 'spec-record',
      currentVersion: 1.2,
      schemaName: ' spec-record.schema.json ',
      ownerPackage: ' @vannadii/devplat-specs ',
      storageScope: 'specs',
      migrationPolicy: 'optional',
      updatedAt: ' 2026-04-30T00:00:00.000Z ',
      description: ' PR-ready spec revisions ',
    },
    {
      artifactType: 'spec-record',
      currentVersion: 2,
      schemaName: ' spec-record-v2.schema.json ',
      ownerPackage: ' @vannadii/devplat-specs ',
      storageScope: 'specs',
      migrationPolicy: 'required',
      updatedAt: ' 2026-04-30T00:01:00.000Z ',
    },
    {
      artifactType: 'spec-record',
      currentVersion: 1,
      schemaName: ' spec-record-legacy.schema.json ',
      ownerPackage: ' @vannadii/devplat-specs ',
      storageScope: 'specs',
      migrationPolicy: 'optional',
      updatedAt: ' 2026-04-30T00:00:30.000Z ',
    },
  ],
  migrations: [
    {
      migrationId: ' spec-1-to-2 ',
      artifactType: 'spec-record',
      fromVersion: 1,
      toVersion: 2,
      summary: ' carry revision history into rendered pull request bodies ',
      migratedAt: ' 2026-04-30T00:02:00.000Z ',
    },
    {
      migrationId: ' spec-2-to-3 ',
      artifactType: 'spec-record',
      fromVersion: 2,
      toVersion: 3,
      summary: ' add source artifact lineage ',
      migratedAt: ' 2026-04-30T00:03:00.000Z ',
    },
  ],
  updatedAt: ' 2026-04-30T00:03:00.000Z ',
};

describe('ArtifactRegistry logic', () => {
  const cases = [
    {
      name: 'creates a default registry for all lifecycle artifact handoffs',
      inputs: {
        repositoryKey: ' repo-main ',
      },
      mock: () => undefined,
      assert: (inputs: { repositoryKey: string }) => {
        const registry = createDefaultArtifactRegistry(inputs.repositoryKey);
        const artifactTypes = registry.entries.map(
          (entry) => entry.artifactType,
        );

        expect(registry.registryId).toBe('repo-main:artifact-registry');
        expect(artifactTypes).toContain('research-brief');
        expect(artifactTypes).toContain('spec-record');
        expect(artifactTypes).toContain('slice-plan');
        expect(artifactTypes).toContain('task-record');
        expect(artifactTypes).toContain('review-finding');
      },
    },
    {
      name: 'normalizes registry metadata and keeps the latest entry per artifact type',
      inputs: {
        registry: baseRegistry,
      },
      mock: () => undefined,
      assert: (inputs: { registry: ArtifactRegistry }) => {
        const registry = createArtifactRegistry(inputs.registry);

        expect(registry.registryId).toBe('artifacts-main');
        expect(registry.repositoryKey).toBe('repo-main');
        expect(registry.entries).toHaveLength(1);
        expect(registry.entries[0]?.currentVersion).toBe(2);
        expect(registry.entries[0]?.schemaName).toBe(
          'spec-record-v2.schema.json',
        );
        expect(registry.migrations[0]?.summary).toBe(
          'carry revision history into rendered pull request bodies',
        );
        expect(describeArtifactRegistry(registry)).toContain(
          '1 artifact types and 2 migrations',
        );
      },
    },
    {
      name: 'normalizes non-finite artifact versions to the minimum supported version',
      inputs: {
        registry: {
          ...baseRegistry,
          entries: [
            {
              artifactType: 'research-brief',
              currentVersion: Number.NaN,
              schemaName: 'research-brief.schema.json',
              ownerPackage: '@vannadii/devplat-research',
              storageScope: 'state',
              migrationPolicy: 'required',
              updatedAt: '2026-04-30T00:04:00.000Z',
            },
          ],
          migrations: [],
        },
      },
      mock: () => undefined,
      assert: (inputs: { registry: ArtifactRegistry }) => {
        const registry = createArtifactRegistry(inputs.registry);

        expect(registry.entries[0]?.currentVersion).toBe(1);
      },
    },
    {
      name: 'registers a new artifact type and updates registry recency',
      inputs: {
        registry: createArtifactRegistry(baseRegistry),
        entry: {
          artifactType: 'gate-run-report',
          currentVersion: 1,
          schemaName: 'gate-run-report.schema.json',
          ownerPackage: '@vannadii/devplat-gates',
          storageScope: 'gates',
          migrationPolicy: 'none',
          updatedAt: '2026-04-30T01:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        registry: ArtifactRegistry;
        entry: ArtifactRegistry['entries'][number];
      }) => {
        const registry = registerArtifactType(inputs.registry, inputs.entry);

        expect(registry.entries.map((entry) => entry.artifactType)).toEqual([
          'gate-run-report',
          'spec-record',
        ]);
        expect(registry.updatedAt).toBe('2026-04-30T01:00:00.000Z');
      },
    },
    {
      name: 'records a migration and normalizes the transition versions',
      inputs: {
        registry: createArtifactRegistry(baseRegistry),
        migration: {
          migrationId: 'gate-0-to-1',
          artifactType: 'gate-run-report',
          fromVersion: 0,
          toVersion: 1.9,
          summary: ' normalize gate classifications ',
          migratedAt: '2026-04-30T02:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        registry: ArtifactRegistry;
        migration: ArtifactRegistry['migrations'][number];
      }) => {
        const registry = recordArtifactMigration(
          inputs.registry,
          inputs.migration,
        );

        expect(registry.migrations).toHaveLength(3);
        expect(registry.migrations[0]?.fromVersion).toBe(1);
        expect(registry.migrations[0]?.toVersion).toBe(1);
        expect(registry.updatedAt).toBe('2026-04-30T02:00:00.000Z');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});
