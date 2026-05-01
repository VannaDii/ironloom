import type {
  ArtifactMigrationRecord,
  ArtifactRegistry,
  ArtifactRegistryEntry,
} from './types.js';

const defaultLifecycleArtifactEntries: ArtifactRegistryEntry[] = [
  {
    artifactType: 'approval-record',
    currentVersion: 1,
    schemaName: 'approval-record.schema.json',
    ownerPackage: '@vannadii/devplat-artifacts',
    storageScope: 'artifacts',
    migrationPolicy: 'none',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description:
      'Operator approval decisions bound to auditable lifecycle state.',
  },
  {
    artifactType: 'audit-log',
    currentVersion: 1,
    schemaName: 'audit-log.schema.json',
    ownerPackage: '@vannadii/devplat-artifacts',
    storageScope: 'audit',
    migrationPolicy: 'none',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Lifecycle-changing action trace with actor and reason.',
  },
  {
    artifactType: 'gate-run-report',
    currentVersion: 1,
    schemaName: 'gate-run-report.schema.json',
    ownerPackage: '@vannadii/devplat-gates',
    storageScope: 'gates',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Gate classification and next-action hints from execution.',
  },
  {
    artifactType: 'merge-decision',
    currentVersion: 1,
    schemaName: 'merge-decision.schema.json',
    ownerPackage: '@vannadii/devplat-artifacts',
    storageScope: 'pull-requests',
    migrationPolicy: 'none',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description:
      'Merge readiness decision projected from policy and delivery state.',
  },
  {
    artifactType: 'pull-request-record',
    currentVersion: 1,
    schemaName: 'pull-request-record.schema.json',
    ownerPackage: '@vannadii/devplat-prs',
    storageScope: 'pull-requests',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Pull request projection and GitHub submission result.',
  },
  {
    artifactType: 'rebase-result',
    currentVersion: 1,
    schemaName: 'rebase-result.schema.json',
    ownerPackage: '@vannadii/devplat-artifacts',
    storageScope: 'artifacts',
    migrationPolicy: 'none',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Dependent branch rebase outcome and conflict classification.',
  },
  {
    artifactType: 'remediation-plan',
    currentVersion: 1,
    schemaName: 'remediation-plan.schema.json',
    ownerPackage: '@vannadii/devplat-remediation',
    storageScope: 'remediation',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description:
      'Autofix or manual remediation plan derived from review failures.',
  },
  {
    artifactType: 'research-brief',
    currentVersion: 1,
    schemaName: 'research-brief.schema.json',
    ownerPackage: '@vannadii/devplat-research',
    storageScope: 'state',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Attributed research sources that seed implementation specs.',
  },
  {
    artifactType: 'review-finding',
    currentVersion: 1,
    schemaName: 'review-finding.schema.json',
    ownerPackage: '@vannadii/devplat-review',
    storageScope: 'reviews',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Spec-vs-implementation findings and reviewer impact summary.',
  },
  {
    artifactType: 'slice-plan',
    currentVersion: 1,
    schemaName: 'slice-plan.schema.json',
    ownerPackage: '@vannadii/devplat-slicing',
    storageScope: 'slices',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description:
      'Dependency-aware implementation slices and PR-sized work packets.',
  },
  {
    artifactType: 'spec-record',
    currentVersion: 1,
    schemaName: 'spec-record.schema.json',
    ownerPackage: '@vannadii/devplat-specs',
    storageScope: 'specs',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Revisioned implementation spec rendered for pull requests.',
  },
  {
    artifactType: 'task-record',
    currentVersion: 1,
    schemaName: 'task-record.schema.json',
    ownerPackage: '@vannadii/devplat-queue',
    storageScope: 'tasks',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Durable queue transition state for implementation work.',
  },
  {
    artifactType: 'telemetry-event',
    currentVersion: 1,
    schemaName: 'telemetry-event.schema.json',
    ownerPackage: '@vannadii/devplat-observability',
    storageScope: 'telemetry',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Run summaries and operator-visible lifecycle telemetry.',
  },
  {
    artifactType: 'worktree-allocation',
    currentVersion: 1,
    schemaName: 'worktree-allocation.schema.json',
    ownerPackage: '@vannadii/devplat-worktrees',
    storageScope: 'worktrees',
    migrationPolicy: 'optional',
    updatedAt: '2026-04-30T00:00:00.000Z',
    description: 'Git worktree allocation, sync, and release state.',
  },
];

function normalizeText(input: string): string {
  return input.trim();
}

function normalizePositiveInteger(input: number): number {
  if (!Number.isFinite(input)) {
    return 1;
  }

  return Math.max(1, Math.trunc(input));
}

function normalizeArtifactRegistryEntry(
  input: ArtifactRegistryEntry,
): ArtifactRegistryEntry {
  const entry = {
    artifactType: normalizeText(input.artifactType),
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

function normalizeArtifactMigrationRecord(
  input: ArtifactMigrationRecord,
): ArtifactMigrationRecord {
  return {
    migrationId: normalizeText(input.migrationId),
    artifactType: normalizeText(input.artifactType),
    fromVersion: normalizePositiveInteger(input.fromVersion),
    toVersion: normalizePositiveInteger(input.toVersion),
    summary: normalizeText(input.summary),
    migratedAt: normalizeText(input.migratedAt),
  };
}

function compareArtifactRegistryEntries(
  left: ArtifactRegistryEntry,
  right: ArtifactRegistryEntry,
): number {
  return left.artifactType.localeCompare(right.artifactType);
}

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

export function createArtifactRegistry(
  input: ArtifactRegistry,
): ArtifactRegistry {
  return {
    registryId: normalizeText(input.registryId),
    version: 1,
    repositoryKey: normalizeText(input.repositoryKey),
    entries: normalizeEntries(input.entries),
    migrations: normalizeMigrations(input.migrations),
    updatedAt: normalizeText(input.updatedAt),
  };
}

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

export function describeArtifactRegistry(input: ArtifactRegistry): string {
  return `${input.registryId} tracks ${String(input.entries.length)} artifact types and ${String(input.migrations.length)} migrations`;
}

export function createDefaultArtifactRegistry(
  repositoryKey: string,
): ArtifactRegistry {
  return createArtifactRegistry({
    registryId: `${normalizeText(repositoryKey)}:artifact-registry`,
    version: 1,
    repositoryKey,
    entries: defaultLifecycleArtifactEntries,
    migrations: [],
    updatedAt: '2026-04-30T00:00:00.000Z',
  });
}
