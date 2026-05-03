import {
  ARTIFACT_TYPE_APPROVAL_RECORD,
  ARTIFACT_TYPE_AUDIT_LOG,
  ARTIFACT_TYPE_DISCORD_THREAD_SESSION,
  ARTIFACT_TYPE_GATE_RUN_REPORT,
  ARTIFACT_TYPE_MERGE_DECISION,
  ARTIFACT_TYPE_PULL_REQUEST_RECORD,
  ARTIFACT_TYPE_REBASE_RESULT,
  ARTIFACT_TYPE_REMEDIATION_PLAN,
  ARTIFACT_TYPE_RESEARCH_BRIEF,
  ARTIFACT_TYPE_REVIEW_FINDING,
  ARTIFACT_TYPE_SLICE_PLAN,
  ARTIFACT_TYPE_SPEC_RECORD,
  ARTIFACT_TYPE_TASK_RECORD,
  ARTIFACT_TYPE_TELEMETRY_EVENT,
  ARTIFACT_TYPE_WORKTREE_ALLOCATION,
  STORE_SCOPE_ARTIFACTS,
  STORE_SCOPE_AUDIT,
  STORE_SCOPE_GATES,
  STORE_SCOPE_PULL_REQUESTS,
  STORE_SCOPE_REMEDIATION,
  STORE_SCOPE_REVIEWS,
  STORE_SCOPE_SLICES,
  STORE_SCOPE_SPECS,
  STORE_SCOPE_STATE,
  STORE_SCOPE_TASKS,
  STORE_SCOPE_TELEMETRY,
  STORE_SCOPE_WORKTREES,
} from '@vannadii/devplat-core';

import {
  ARTIFACT_REGISTRY_VERSION,
  DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
} from './constants.js';
import type {
  ArtifactMigrationRecord,
  ArtifactRegistry,
  ArtifactRegistryEntry,
} from './codec.js';

/**
 * Creates the baseline lifecycle artifact entries for a configured repository.
 */
function createDefaultLifecycleArtifactEntries(): ArtifactRegistryEntry[] {
  return [
    {
      artifactType: ARTIFACT_TYPE_APPROVAL_RECORD,
      currentVersion: 1,
      schemaName: 'approval-record.schema.json',
      ownerPackage: '@vannadii/devplat-artifacts',
      storageScope: STORE_SCOPE_ARTIFACTS,
      migrationPolicy: 'none',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Operator approval decisions bound to auditable lifecycle state.',
    },
    {
      artifactType: ARTIFACT_TYPE_AUDIT_LOG,
      currentVersion: 1,
      schemaName: 'audit-log.schema.json',
      ownerPackage: '@vannadii/devplat-artifacts',
      storageScope: STORE_SCOPE_AUDIT,
      migrationPolicy: 'none',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description: 'Lifecycle-changing action trace with actor and reason.',
    },
    {
      artifactType: ARTIFACT_TYPE_DISCORD_THREAD_SESSION,
      currentVersion: 1,
      schemaName: 'discord-thread-session.schema.json',
      ownerPackage: '@vannadii/devplat-discord',
      storageScope: STORE_SCOPE_ARTIFACTS,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Discord thread binding state used to revalidate operator controls.',
    },
    {
      artifactType: ARTIFACT_TYPE_GATE_RUN_REPORT,
      currentVersion: 1,
      schemaName: 'gate-run-report.schema.json',
      ownerPackage: '@vannadii/devplat-gates',
      storageScope: STORE_SCOPE_GATES,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description: 'Gate classification and next-action hints from execution.',
    },
    {
      artifactType: ARTIFACT_TYPE_MERGE_DECISION,
      currentVersion: 1,
      schemaName: 'merge-decision.schema.json',
      ownerPackage: '@vannadii/devplat-artifacts',
      storageScope: STORE_SCOPE_PULL_REQUESTS,
      migrationPolicy: 'none',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Merge readiness decision projected from policy and delivery state.',
    },
    {
      artifactType: ARTIFACT_TYPE_PULL_REQUEST_RECORD,
      currentVersion: 1,
      schemaName: 'pull-request-record.schema.json',
      ownerPackage: '@vannadii/devplat-prs',
      storageScope: STORE_SCOPE_PULL_REQUESTS,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description: 'Pull request projection and GitHub submission result.',
    },
    {
      artifactType: ARTIFACT_TYPE_REBASE_RESULT,
      currentVersion: 1,
      schemaName: 'rebase-result.schema.json',
      ownerPackage: '@vannadii/devplat-artifacts',
      storageScope: STORE_SCOPE_ARTIFACTS,
      migrationPolicy: 'none',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Dependent branch rebase outcome and conflict classification.',
    },
    {
      artifactType: ARTIFACT_TYPE_REMEDIATION_PLAN,
      currentVersion: 1,
      schemaName: 'remediation-plan.schema.json',
      ownerPackage: '@vannadii/devplat-remediation',
      storageScope: STORE_SCOPE_REMEDIATION,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Autofix or manual remediation plan derived from review failures.',
    },
    {
      artifactType: ARTIFACT_TYPE_RESEARCH_BRIEF,
      currentVersion: 1,
      schemaName: 'research-brief.schema.json',
      ownerPackage: '@vannadii/devplat-research',
      storageScope: STORE_SCOPE_STATE,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Attributed research sources that seed implementation specs.',
    },
    {
      artifactType: ARTIFACT_TYPE_REVIEW_FINDING,
      currentVersion: 1,
      schemaName: 'review-finding.schema.json',
      ownerPackage: '@vannadii/devplat-review',
      storageScope: STORE_SCOPE_REVIEWS,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Spec-vs-implementation findings and reviewer impact summary.',
    },
    {
      artifactType: ARTIFACT_TYPE_SLICE_PLAN,
      currentVersion: 1,
      schemaName: 'slice-plan.schema.json',
      ownerPackage: '@vannadii/devplat-slicing',
      storageScope: STORE_SCOPE_SLICES,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description:
        'Dependency-aware implementation slices and PR-sized work packets.',
    },
    {
      artifactType: ARTIFACT_TYPE_SPEC_RECORD,
      currentVersion: 1,
      schemaName: 'spec-record.schema.json',
      ownerPackage: '@vannadii/devplat-specs',
      storageScope: STORE_SCOPE_SPECS,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description: 'Revisioned implementation spec rendered for pull requests.',
    },
    {
      artifactType: ARTIFACT_TYPE_TASK_RECORD,
      currentVersion: 1,
      schemaName: 'task-record.schema.json',
      ownerPackage: '@vannadii/devplat-queue',
      storageScope: STORE_SCOPE_TASKS,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description: 'Durable queue transition state for implementation work.',
    },
    {
      artifactType: ARTIFACT_TYPE_TELEMETRY_EVENT,
      currentVersion: 1,
      schemaName: 'telemetry-event.schema.json',
      ownerPackage: '@vannadii/devplat-observability',
      storageScope: STORE_SCOPE_TELEMETRY,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description: 'Run summaries and operator-visible lifecycle telemetry.',
    },
    {
      artifactType: ARTIFACT_TYPE_WORKTREE_ALLOCATION,
      currentVersion: 1,
      schemaName: 'worktree-allocation.schema.json',
      ownerPackage: '@vannadii/devplat-worktrees',
      storageScope: STORE_SCOPE_WORKTREES,
      migrationPolicy: 'optional',
      updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
      description: 'Git worktree allocation, sync, and release state.',
    },
  ];
}

/**
 * Trims operator-authored registry text.
 */
function normalizeText(input: string): string {
  return input.trim();
}

/**
 * Normalizes registry versions to positive integers.
 */
function normalizePositiveInteger(input: number): number {
  if (!Number.isFinite(input)) {
    return 1;
  }

  return Math.max(1, Math.trunc(input));
}

/**
 * Normalizes a registry entry while preserving validated enum fields.
 */
function normalizeArtifactRegistryEntry(
  input: ArtifactRegistryEntry,
): ArtifactRegistryEntry {
  const entry = {
    artifactType: input.artifactType,
    currentVersion: normalizePositiveInteger(input.currentVersion),
    schemaName: normalizeText(input.schemaName),
    ownerPackage: normalizeText(input.ownerPackage),
    storageScope: input.storageScope,
    migrationPolicy: input.migrationPolicy,
    updatedAt: normalizeText(input.updatedAt),
  };

  if (input.description === undefined) {
    return entry;
  }

  return {
    ...entry,
    description: normalizeText(input.description),
  };
}

/**
 * Normalizes a migration record while preserving validated artifact identity.
 */
function normalizeArtifactMigrationRecord(
  input: ArtifactMigrationRecord,
): ArtifactMigrationRecord {
  return {
    migrationId: normalizeText(input.migrationId),
    artifactType: input.artifactType,
    fromVersion: normalizePositiveInteger(input.fromVersion),
    toVersion: normalizePositiveInteger(input.toVersion),
    summary: normalizeText(input.summary),
    migratedAt: normalizeText(input.migratedAt),
  };
}

/**
 * Sorts registry entries by artifact type for deterministic output.
 */
function compareArtifactRegistryEntries(
  left: ArtifactRegistryEntry,
  right: ArtifactRegistryEntry,
): number {
  return left.artifactType.localeCompare(right.artifactType);
}

/**
 * Sorts migration records by artifact type and source version.
 */
function compareArtifactMigrationRecords(
  left: ArtifactMigrationRecord,
  right: ArtifactMigrationRecord,
): number {
  const artifactComparison = left.artifactType.localeCompare(
    right.artifactType,
  );
  if (artifactComparison !== 0) {
    return artifactComparison;
  }

  return left.fromVersion - right.fromVersion;
}

/**
 * Sorts migration candidates by target version and identifier for stable paths.
 */
function compareArtifactMigrationCandidates(
  left: ArtifactMigrationRecord,
  right: ArtifactMigrationRecord,
): number {
  const versionComparison = left.toVersion - right.toVersion;
  if (versionComparison !== 0) {
    return versionComparison;
  }

  return left.migrationId.localeCompare(right.migrationId);
}

/**
 * Recursively searches for a complete forward migration path.
 */
function searchArtifactMigrationPath(
  migrations: readonly ArtifactMigrationRecord[],
  artifactType: ArtifactRegistryEntry['artifactType'],
  currentVersion: number,
  targetVersion: number,
  visitedVersions: ReadonlySet<number>,
): ArtifactMigrationRecord[] {
  if (currentVersion === targetVersion) {
    return [];
  }

  const candidates = migrations
    .filter(
      (migration) =>
        migration.artifactType === artifactType &&
        migration.fromVersion === currentVersion &&
        migration.toVersion > currentVersion &&
        migration.toVersion <= targetVersion &&
        !visitedVersions.has(migration.toVersion),
    )
    .sort(compareArtifactMigrationCandidates);

  for (const candidate of candidates) {
    const nextVisitedVersions = new Set(visitedVersions);
    nextVisitedVersions.add(candidate.toVersion);
    const remainder = searchArtifactMigrationPath(
      migrations,
      artifactType,
      candidate.toVersion,
      targetVersion,
      nextVisitedVersions,
    );

    if (candidate.toVersion === targetVersion || remainder.length > 0) {
      return [candidate, ...remainder];
    }
  }

  return [];
}

/**
 * Deduplicates entries, keeping the latest version for each artifact type.
 */
function normalizeEntries(
  entries: readonly ArtifactRegistryEntry[],
): ArtifactRegistryEntry[] {
  const entriesByType = new Map<string, ArtifactRegistryEntry>();

  for (const input of entries) {
    const entry = normalizeArtifactRegistryEntry(input);
    const existing = entriesByType.get(entry.artifactType);

    if (
      existing === undefined ||
      entry.currentVersion >= existing.currentVersion
    ) {
      entriesByType.set(entry.artifactType, entry);
    }
  }

  return [...entriesByType.values()].sort(compareArtifactRegistryEntries);
}

/**
 * Deduplicates migration records by migration identifier.
 */
function normalizeMigrations(
  migrations: readonly ArtifactMigrationRecord[],
): ArtifactMigrationRecord[] {
  const migrationsById = new Map<string, ArtifactMigrationRecord>();

  for (const input of migrations) {
    const migration = normalizeArtifactMigrationRecord(input);
    migrationsById.set(migration.migrationId, migration);
  }

  return [...migrationsById.values()].sort(compareArtifactMigrationRecords);
}

/**
 * Normalizes an artifact registry into deterministic persisted shape.
 */
export function createArtifactRegistry(
  input: ArtifactRegistry,
): ArtifactRegistry {
  return {
    registryId: normalizeText(input.registryId),
    version: ARTIFACT_REGISTRY_VERSION,
    repositoryKey: normalizeText(input.repositoryKey),
    entries: normalizeEntries(input.entries),
    migrations: normalizeMigrations(input.migrations),
    updatedAt: normalizeText(input.updatedAt),
  };
}

/**
 * Adds or replaces an artifact type entry in a registry.
 */
export function registerArtifactType(
  registry: ArtifactRegistry,
  entry: ArtifactRegistryEntry,
): ArtifactRegistry {
  return createArtifactRegistry({
    ...registry,
    entries: [...registry.entries, entry],
    updatedAt: normalizeText(entry.updatedAt),
  });
}

/**
 * Records a migration event in a registry.
 */
export function recordArtifactMigration(
  registry: ArtifactRegistry,
  migration: ArtifactMigrationRecord,
): ArtifactRegistry {
  return createArtifactRegistry({
    ...registry,
    migrations: [...registry.migrations, migration],
    updatedAt: normalizeText(migration.migratedAt),
  });
}

/**
 * Finds an ordered migration path between artifact versions.
 */
export function findArtifactMigrationPath(
  registry: ArtifactRegistry,
  artifactType: ArtifactRegistryEntry['artifactType'],
  fromVersion: number,
  toVersion: number,
): ArtifactMigrationRecord[] {
  const sourceVersion = normalizePositiveInteger(fromVersion);
  const targetVersion = normalizePositiveInteger(toVersion);
  if (sourceVersion >= targetVersion) {
    return [];
  }

  return searchArtifactMigrationPath(
    normalizeMigrations(registry.migrations),
    artifactType,
    sourceVersion,
    targetVersion,
    new Set([sourceVersion]),
  );
}

/**
 * Describes a registry for operator status output.
 */
export function describeArtifactRegistry(input: ArtifactRegistry): string {
  return `${input.registryId} tracks ${String(input.entries.length)} artifact types and ${String(input.migrations.length)} migrations`;
}

/**
 * Creates the default repository-scoped lifecycle artifact registry.
 */
export function createDefaultArtifactRegistry(
  repositoryKey: string,
): ArtifactRegistry {
  return createArtifactRegistry({
    registryId: `${normalizeText(repositoryKey)}:artifact-registry`,
    version: ARTIFACT_REGISTRY_VERSION,
    repositoryKey,
    entries: createDefaultLifecycleArtifactEntries(),
    migrations: [],
    updatedAt: DEFAULT_ARTIFACT_REGISTRY_UPDATED_AT,
  });
}
