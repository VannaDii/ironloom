import {
  ARTIFACT_TYPE_APPROVAL_RECORD,
  ARTIFACT_TYPE_AUDIT_LOG,
  ARTIFACT_TYPE_MERGE_DECISION,
  ARTIFACT_TYPE_REBASE_RESULT,
  appendTrace,
  createDevplatError,
  createDevplatFailure,
  decodeWithCodec,
  type DevplatResult,
} from '@vannadii/devplat-core';

import {
  ArtifactEnvelopeCodec,
  ArtifactEnvelopeService,
  type ArtifactEnvelope,
} from '../artifact-envelope/index.js';
import {
  ApprovalRecordArtifactCodec,
  ApprovalRecordArtifactService,
  type ApprovalRecordArtifact,
} from '../approval-record/index.js';
import {
  AuditLogArtifactCodec,
  AuditLogArtifactService,
  type AuditLogArtifact,
} from '../audit-log/index.js';
import {
  MergeDecisionArtifactCodec,
  MergeDecisionArtifactService,
  type MergeDecisionArtifact,
} from '../merge-decision/index.js';
import {
  RebaseResultArtifactCodec,
  RebaseResultArtifactService,
  type RebaseResultArtifact,
} from '../rebase-result/index.js';
import type {
  ArtifactRegistry,
  ArtifactRegistryEntry,
} from '../artifact-registry/index.js';
import { findArtifactMigrationPath } from '../artifact-registry/index.js';
import {
  ARTIFACT_VALIDATION_MIGRATION_PATH_SEPARATOR,
  ARTIFACT_VALIDATION_MIGRATION_REQUIRED_ERROR_CODE,
  ARTIFACT_VALIDATION_PAYLOAD_INVALID_ERROR_CODE,
  ARTIFACT_VALIDATION_PAYLOAD_TRACE_PREFIX,
} from './constants.js';

/** Artifact type accepted by the validation dispatcher. */
export type KnownArtifact =
  | ApprovalRecordArtifact
  | AuditLogArtifact
  | MergeDecisionArtifact
  | RebaseResultArtifact
  | ArtifactEnvelope;

/** Delegated payload validator for registry-supported artifact envelopes. */
export type ArtifactPayloadValidator = (
  payload: unknown,
) => DevplatResult<unknown>;

/** Registry constraints that can harden artifact validation. */
export type ArtifactValidationOptions = {
  registry?: ArtifactRegistry;
  payloadValidators?: ReadonlyMap<string, ArtifactPayloadValidator>;
};

/**
 * Finds the migration path that updates an artifact to the registry version.
 */
function findApplicableMigrations(
  registry: ArtifactRegistry,
  envelope: ArtifactEnvelope,
  entry: ArtifactRegistryEntry,
): ReturnType<typeof findArtifactMigrationPath> {
  return findArtifactMigrationPath(
    registry,
    envelope.artifactType,
    envelope.version,
    entry.currentVersion,
  );
}

/**
 * Builds migration diagnostic details with optional migration path metadata.
 */
function createMigrationDiagnosticDetails(
  registry: ArtifactRegistry,
  envelope: ArtifactEnvelope,
  entry: ArtifactRegistryEntry,
  migrationIds: readonly string[],
): Record<string, unknown> {
  const details = {
    artifactType: envelope.artifactType,
    artifactVersion: envelope.version,
    currentVersion: entry.currentVersion,
    registryId: registry.registryId,
  };

  if (migrationIds.length === 0) {
    return details;
  }

  return {
    ...details,
    migrationId: migrationIds[0],
    migrationIds,
  };
}

/**
 * Formats the required-migration validation failure with registry context.
 */
function createMigrationRequiredFailure(
  registry: ArtifactRegistry,
  envelope: ArtifactEnvelope,
  entry: ArtifactRegistryEntry,
): DevplatResult<ArtifactEnvelope> {
  const migrations = findApplicableMigrations(registry, envelope, entry);
  const migrationIds = migrations.map((migration) => migration.migrationId);
  const migrationHint =
    migrationIds.length === 0
      ? ''
      : ` ${migrationIds.join(ARTIFACT_VALIDATION_MIGRATION_PATH_SEPARATOR)}`;
  const error = `Artifact ${envelope.artifactType}@v${String(envelope.version)} requires migration${migrationHint} to v${String(entry.currentVersion)} before validation.`;

  return createDevplatFailure({
    error,
    diagnostic: createDevplatError({
      kind: 'validation',
      message: error,
      code: ARTIFACT_VALIDATION_MIGRATION_REQUIRED_ERROR_CODE,
      details: createMigrationDiagnosticDetails(
        registry,
        envelope,
        entry,
        migrationIds,
      ),
    }),
  });
}

/**
 * Validates a registry-supported envelope payload with a delegated package codec.
 */
function validateEnvelopePayload(
  envelope: ArtifactEnvelope,
  validators: ReadonlyMap<string, ArtifactPayloadValidator> | undefined,
): DevplatResult<ArtifactEnvelope> {
  const validator = validators?.get(envelope.artifactType);
  if (validator === undefined) {
    return {
      ok: true,
      value: envelope,
    };
  }

  const result = validator(envelope.payload);
  if (!result.ok) {
    const error = `Artifact ${envelope.artifactType}@v${String(envelope.version)} payload failed delegated validation: ${result.error}`;

    return createDevplatFailure({
      error,
      diagnostic: createDevplatError({
        kind: 'validation',
        message: error,
        code: ARTIFACT_VALIDATION_PAYLOAD_INVALID_ERROR_CODE,
        details: {
          artifactType: envelope.artifactType,
          artifactVersion: envelope.version,
          delegatedError: result.error,
        },
      }),
    });
  }

  return {
    ok: true,
    value: appendTrace(
      envelope,
      `${ARTIFACT_VALIDATION_PAYLOAD_TRACE_PREFIX}${envelope.artifactType}`,
    ),
  };
}

/**
 * Validates the decoded envelope against the active repository registry.
 */
function validateEnvelopeRegistry(
  envelope: ArtifactEnvelope,
  registry: ArtifactRegistry | undefined,
): DevplatResult<ArtifactEnvelope> {
  if (registry === undefined) {
    return {
      ok: true,
      value: envelope,
    };
  }

  const entry = registry.entries.find(
    (registryEntry) => registryEntry.artifactType === envelope.artifactType,
  );
  if (entry === undefined) {
    return createDevplatFailure({
      error: `Artifact type ${envelope.artifactType} is not registered for this repository.`,
    });
  }

  if (
    envelope.version < entry.currentVersion &&
    entry.migrationPolicy === 'required'
  ) {
    return createMigrationRequiredFailure(registry, envelope, entry);
  }

  if (envelope.version > entry.currentVersion) {
    return createDevplatFailure({
      error: `Artifact ${envelope.artifactType}@v${String(envelope.version)} is newer than registered v${String(entry.currentVersion)}.`,
    });
  }

  return {
    ok: true,
    value: envelope,
  };
}

/**
 * Validates a generic artifact and dispatches known artifact types to their
 * specialized normalizers.
 */
export function validateArtifact(
  input: unknown,
  options: ArtifactValidationOptions = {},
): DevplatResult<KnownArtifact> {
  const envelope = decodeWithCodec(ArtifactEnvelopeCodec, input);
  if (!envelope.ok) {
    return envelope;
  }

  const registryResult = validateEnvelopeRegistry(
    envelope.value,
    options.registry,
  );
  if (!registryResult.ok) {
    return registryResult;
  }

  const payloadResult = validateEnvelopePayload(
    registryResult.value,
    options.payloadValidators,
  );
  if (!payloadResult.ok) {
    return payloadResult;
  }

  switch (payloadResult.value.artifactType) {
    case ARTIFACT_TYPE_APPROVAL_RECORD: {
      const artifact = decodeWithCodec(ApprovalRecordArtifactCodec, input);
      if (!artifact.ok) {
        return artifact;
      }

      return {
        ok: true,
        value: new ApprovalRecordArtifactService().execute(artifact.value),
      };
    }
    case ARTIFACT_TYPE_AUDIT_LOG: {
      const artifact = decodeWithCodec(AuditLogArtifactCodec, input);
      if (!artifact.ok) {
        return artifact;
      }

      return {
        ok: true,
        value: new AuditLogArtifactService().execute(artifact.value),
      };
    }
    case ARTIFACT_TYPE_MERGE_DECISION: {
      const artifact = decodeWithCodec(MergeDecisionArtifactCodec, input);
      if (!artifact.ok) {
        return artifact;
      }

      return {
        ok: true,
        value: new MergeDecisionArtifactService().execute(artifact.value),
      };
    }
    case ARTIFACT_TYPE_REBASE_RESULT: {
      const artifact = decodeWithCodec(RebaseResultArtifactCodec, input);
      if (!artifact.ok) {
        return artifact;
      }

      return {
        ok: true,
        value: new RebaseResultArtifactService().execute(artifact.value),
      };
    }
    default:
      return {
        ok: true,
        value: new ArtifactEnvelopeService().execute(payloadResult.value),
      };
  }
}

/**
 * Describes a validated artifact with artifact type and version.
 */
export function describeValidatedArtifact(input: KnownArtifact): string {
  return `${input.artifactType}@v${String(input.version)}`;
}
