import type * as t from 'io-ts';

import type {
  ArtifactMigrationPolicyCodec,
  ArtifactMigrationRecordCodec,
  ArtifactRegistryCodec,
  ArtifactRegistryEntryCodec,
  ArtifactRegistryStorageScopeCodec,
} from './codec.js';

export type ArtifactMigrationPolicy = t.TypeOf<
  typeof ArtifactMigrationPolicyCodec
>;

export type ArtifactRegistryEntry = t.TypeOf<typeof ArtifactRegistryEntryCodec>;

export type ArtifactRegistryStorageScope = t.TypeOf<
  typeof ArtifactRegistryStorageScopeCodec
>;

export type ArtifactMigrationRecord = t.TypeOf<
  typeof ArtifactMigrationRecordCodec
>;

export type ArtifactRegistry = t.TypeOf<typeof ArtifactRegistryCodec>;
