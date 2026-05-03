import {
  ARTIFACT_TYPE_APPROVAL_RECORD,
  ARTIFACT_TYPE_AUDIT_LOG,
  ARTIFACT_TYPE_MERGE_DECISION,
  ARTIFACT_TYPE_REBASE_RESULT,
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
import type { ArtifactRegistry } from '../artifact-registry/index.js';

/** Artifact type accepted by the validation dispatcher. */
export type KnownArtifact =
  | ApprovalRecordArtifact
  | AuditLogArtifact
  | MergeDecisionArtifact
  | RebaseResultArtifact
  | ArtifactEnvelope;

/** Registry constraints that can harden artifact validation. */
export type ArtifactValidationOptions = {
  registry?: ArtifactRegistry;
};

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
    return createDevplatFailure({
      error: `Artifact ${envelope.artifactType}@v${String(envelope.version)} requires migration to v${String(entry.currentVersion)} before validation.`,
    });
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

  switch (envelope.value.artifactType) {
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
        value: new ArtifactEnvelopeService().execute(envelope.value),
      };
  }
}

/**
 * Describes a validated artifact with artifact type and version.
 */
export function describeValidatedArtifact(input: KnownArtifact): string {
  return `${input.artifactType}@v${String(input.version)}`;
}
