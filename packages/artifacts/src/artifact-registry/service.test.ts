import { describe, expect, it } from 'vitest';

import { ArtifactRegistryService } from './service.js';
import type { ArtifactRegistry } from './codec.js';

const registry: ArtifactRegistry = {
  registryId: 'artifacts-main',
  version: 1,
  repositoryKey: 'repo-main',
  entries: [
    {
      artifactType: 'approval-record',
      currentVersion: 1,
      schemaName: 'approval-record.schema.json',
      ownerPackage: '@vannadii/devplat-artifacts',
      storageScope: 'artifacts',
      migrationPolicy: 'none',
      updatedAt: '2026-04-30T00:00:00.000Z',
    },
  ],
  migrations: [],
  updatedAt: '2026-04-30T00:00:00.000Z',
};

describe('ArtifactRegistryService', () => {
  const cases = [
    {
      name: 'delegates default registry creation',
      inputs: {
        repositoryKey: 'repo-main',
      },
      mock: () => new ArtifactRegistryService(),
      assert: (
        inputs: { repositoryKey: string },
        service: ArtifactRegistryService,
      ) => {
        const registry = service.createDefault(inputs.repositoryKey);

        expect(registry.entries.length).toBeGreaterThan(10);
        expect(registry.entries[0]?.artifactType).toBe('approval-record');
      },
    },
    {
      name: 'delegates registry normalization and explanation',
      inputs: {
        registry,
      },
      mock: () => new ArtifactRegistryService(),
      assert: (
        inputs: { registry: ArtifactRegistry },
        service: ArtifactRegistryService,
      ) => {
        const normalized = service.execute(inputs.registry);

        expect(service.explain(normalized)).toContain('1 artifact types');
      },
    },
    {
      name: 'delegates artifact registration',
      inputs: {
        registry,
        entry: {
          artifactType: 'audit-log',
          currentVersion: 1,
          schemaName: 'audit-log.schema.json',
          ownerPackage: '@vannadii/devplat-artifacts',
          storageScope: 'artifacts',
          migrationPolicy: 'none',
          updatedAt: '2026-04-30T00:01:00.000Z',
        },
      },
      mock: () => new ArtifactRegistryService(),
      assert: (
        inputs: {
          registry: ArtifactRegistry;
          entry: ArtifactRegistry['entries'][number];
        },
        service: ArtifactRegistryService,
      ) => {
        const updated = service.register(inputs.registry, inputs.entry);

        expect(updated.entries.map((entry) => entry.artifactType)).toContain(
          'audit-log',
        );
      },
    },
    {
      name: 'delegates migration recording',
      inputs: {
        registry,
        migration: {
          migrationId: 'approval-1-to-2',
          artifactType: 'approval-record',
          fromVersion: 1,
          toVersion: 2,
          summary: 'capture bound thread context',
          migratedAt: '2026-04-30T00:02:00.000Z',
        },
      },
      mock: () => new ArtifactRegistryService(),
      assert: (
        inputs: {
          registry: ArtifactRegistry;
          migration: ArtifactRegistry['migrations'][number];
        },
        service: ArtifactRegistryService,
      ) => {
        const updated = service.recordMigration(
          inputs.registry,
          inputs.migration,
        );

        expect(updated.migrations[0]?.migrationId).toBe('approval-1-to-2');
      },
    },
    {
      name: 'delegates migration path lookup',
      inputs: {
        registry: {
          ...registry,
          entries: [
            {
              artifactType: 'approval-record',
              currentVersion: 3,
              schemaName: 'approval-record.schema.json',
              ownerPackage: '@vannadii/devplat-artifacts',
              storageScope: 'artifacts',
              migrationPolicy: 'required',
              updatedAt: '2026-04-30T00:03:00.000Z',
            },
          ],
          migrations: [
            {
              migrationId: 'approval-2-to-3',
              artifactType: 'approval-record',
              fromVersion: 2,
              toVersion: 3,
              summary: 'capture policy reason',
              migratedAt: '2026-04-30T00:03:00.000Z',
            },
            {
              migrationId: 'approval-1-to-2',
              artifactType: 'approval-record',
              fromVersion: 1,
              toVersion: 2,
              summary: 'capture bound thread context',
              migratedAt: '2026-04-30T00:02:00.000Z',
            },
          ],
        },
        artifactType: 'approval-record',
        fromVersion: 1,
        toVersion: 3,
      },
      mock: () => new ArtifactRegistryService(),
      assert: (
        inputs: {
          registry: ArtifactRegistry;
          artifactType: 'approval-record';
          fromVersion: number;
          toVersion: number;
        },
        service: ArtifactRegistryService,
      ) => {
        const path = service.findMigrationPath(
          inputs.registry,
          inputs.artifactType,
          inputs.fromVersion,
          inputs.toVersion,
        );

        expect(path.map((migration) => migration.migrationId)).toEqual([
          'approval-1-to-2',
          'approval-2-to-3',
        ]);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const service = testCase.mock();
    testCase.assert(testCase.inputs, service);
  });
});
