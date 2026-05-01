import { ARTIFACT_TYPE_MERGE_DECISION } from '@vannadii/devplat-core';

import {
  createArtifactEnvelope,
  describeArtifactEnvelope,
} from '../artifact-envelope/logic.js';
import type { MergeDecisionArtifact } from './codec.js';
import { MERGE_DECISION_ARTIFACT_VERSION } from './constants.js';

/**
 * Normalizes a merge decision artifact before persistence.
 */
export function createMergeDecisionArtifact(
  input: MergeDecisionArtifact,
): MergeDecisionArtifact {
  return createArtifactEnvelope({
    ...input,
    artifactType: ARTIFACT_TYPE_MERGE_DECISION,
    version: MERGE_DECISION_ARTIFACT_VERSION,
    payload: {
      ...input.payload,
      decisionId: input.payload.decisionId.trim(),
      actorId: input.payload.actorId.trim(),
      rationale: input.payload.rationale.trim(),
      blockingFindings: input.payload.blockingFindings.map((finding) =>
        finding.trim(),
      ),
    },
  });
}

/**
 * Describes a merge decision artifact for PR status output.
 */
export function describeMergeDecisionArtifact(
  input: MergeDecisionArtifact,
): string {
  return `${describeArtifactEnvelope(input)} :: pr #${String(input.payload.prNumber)} ${input.payload.approved ? 'approved' : 'blocked'}`;
}
