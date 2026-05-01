import { ARTIFACT_TYPE_APPROVAL_RECORD } from '@vannadii/devplat-core';

import {
  createArtifactEnvelope,
  describeArtifactEnvelope,
} from '../artifact-envelope/logic.js';
import type { ApprovalRecordArtifact } from './codec.js';
import { APPROVAL_RECORD_ARTIFACT_VERSION } from './constants.js';

/**
 * Normalizes an approval artifact before it is persisted or returned.
 */
export function createApprovalRecordArtifact(
  input: ApprovalRecordArtifact,
): ApprovalRecordArtifact {
  return createArtifactEnvelope({
    ...input,
    artifactType: ARTIFACT_TYPE_APPROVAL_RECORD,
    version: APPROVAL_RECORD_ARTIFACT_VERSION,
    payload: {
      ...input.payload,
      approvalId: input.payload.approvalId.trim(),
      subjectId: input.payload.subjectId.trim(),
      actorId: input.payload.actorId.trim(),
      rationale: input.payload.rationale.trim(),
    },
  });
}

/**
 * Describes an approval artifact for operator-facing status output.
 */
export function describeApprovalRecordArtifact(
  input: ApprovalRecordArtifact,
): string {
  return `${describeArtifactEnvelope(input)} :: ${input.payload.decision} ${input.payload.subjectType} ${input.payload.subjectId}`;
}
