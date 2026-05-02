import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  STORE_SCOPE_ARTIFACTS,
  STORE_SCOPE_AUDIT,
  STORE_SCOPE_GATES,
  STORE_SCOPE_MEMORY,
  STORE_SCOPE_PULL_REQUESTS,
  STORE_SCOPE_REMEDIATION,
  STORE_SCOPE_REVIEWS,
  STORE_SCOPE_SLICES,
  STORE_SCOPE_SPECS,
  STORE_SCOPE_STATE,
  STORE_SCOPE_TASKS,
  STORE_SCOPE_TELEMETRY,
  STORE_SCOPE_WORKTREES,
  SupportedArtifactTypeCodec,
} from '@vannadii/devplat-core';

import { ARTIFACT_REGISTRY_VERSION } from './constants.js';

/**
 * Codec for artifact migration policy values.
 */
export const ArtifactMigrationPolicyCodec = t.union([
  t.literal('none'),
  t.literal('optional'),
  t.literal('required'),
]);

/**
 * Codec for storage scopes supported by registry entries.
 */
export const ArtifactRegistryStorageScopeCodec = t.union([
  t.literal(STORE_SCOPE_ARTIFACTS),
  t.literal(STORE_SCOPE_AUDIT),
  t.literal(STORE_SCOPE_GATES),
  t.literal(STORE_SCOPE_MEMORY),
  t.literal(STORE_SCOPE_PULL_REQUESTS),
  t.literal(STORE_SCOPE_REMEDIATION),
  t.literal(STORE_SCOPE_REVIEWS),
  t.literal(STORE_SCOPE_SLICES),
  t.literal(STORE_SCOPE_SPECS),
  t.literal(STORE_SCOPE_STATE),
  t.literal(STORE_SCOPE_TASKS),
  t.literal(STORE_SCOPE_TELEMETRY),
  t.literal(STORE_SCOPE_WORKTREES),
]);

/**
 * Codec for a registered lifecycle artifact type.
 */
export const ArtifactRegistryEntryCodec = t.intersection([
  t.type({
    artifactType: SupportedArtifactTypeCodec,
    currentVersion: t.number,
    schemaName: t.string,
    ownerPackage: t.string,
    storageScope: ArtifactRegistryStorageScopeCodec,
    migrationPolicy: ArtifactMigrationPolicyCodec,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    description: t.string,
  }),
]);

/**
 * Codec for a persisted artifact migration event.
 */
export const ArtifactMigrationRecordCodec = t.type({
  migrationId: t.string,
  artifactType: SupportedArtifactTypeCodec,
  fromVersion: t.number,
  toVersion: t.number,
  summary: t.string,
  migratedAt: IsoTimestampCodec,
});

/**
 * Codec for the repository-scoped artifact registry.
 */
export const ArtifactRegistryCodec = t.type({
  registryId: t.string,
  version: t.literal(ARTIFACT_REGISTRY_VERSION),
  repositoryKey: t.string,
  entries: t.array(ArtifactRegistryEntryCodec),
  migrations: t.array(ArtifactMigrationRecordCodec),
  updatedAt: IsoTimestampCodec,
});

/**
 * Artifact migration policy derived from the source codec.
 */
export type ArtifactMigrationPolicy = t.TypeOf<
  typeof ArtifactMigrationPolicyCodec
>;

/**
 * Artifact registry entry derived from the source codec.
 */
export type ArtifactRegistryEntry = t.TypeOf<typeof ArtifactRegistryEntryCodec>;

/**
 * Artifact registry storage scope derived from the source codec.
 */
export type ArtifactRegistryStorageScope = t.TypeOf<
  typeof ArtifactRegistryStorageScopeCodec
>;

/**
 * Artifact migration record derived from the source codec.
 */
export type ArtifactMigrationRecord = t.TypeOf<
  typeof ArtifactMigrationRecordCodec
>;

/**
 * Artifact registry derived from the source codec.
 */
export type ArtifactRegistry = t.TypeOf<typeof ArtifactRegistryCodec>;
