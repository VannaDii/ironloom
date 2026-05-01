import * as t from 'io-ts';

export const ArtifactMigrationPolicyCodec = t.union([
  t.literal('none'),
  t.literal('optional'),
  t.literal('required'),
]);

export const ArtifactRegistryStorageScopeCodec = t.union([
  t.literal('artifacts'),
  t.literal('audit'),
  t.literal('gates'),
  t.literal('memory'),
  t.literal('pull-requests'),
  t.literal('remediation'),
  t.literal('reviews'),
  t.literal('slices'),
  t.literal('specs'),
  t.literal('state'),
  t.literal('tasks'),
  t.literal('telemetry'),
  t.literal('worktrees'),
]);

export const ArtifactRegistryEntryCodec = t.intersection([
  t.type({
    artifactType: t.string,
    currentVersion: t.number,
    schemaName: t.string,
    ownerPackage: t.string,
    storageScope: ArtifactRegistryStorageScopeCodec,
    migrationPolicy: ArtifactMigrationPolicyCodec,
    updatedAt: t.string,
  }),
  t.partial({
    description: t.string,
  }),
]);

export const ArtifactMigrationRecordCodec = t.type({
  migrationId: t.string,
  artifactType: t.string,
  fromVersion: t.number,
  toVersion: t.number,
  summary: t.string,
  migratedAt: t.string,
});

export const ArtifactRegistryCodec = t.type({
  registryId: t.string,
  version: t.literal(1),
  repositoryKey: t.string,
  entries: t.array(ArtifactRegistryEntryCodec),
  migrations: t.array(ArtifactMigrationRecordCodec),
  updatedAt: t.string,
});
