import { ARTIFACT_TYPE_REBASE_RESULT } from '@vannadii/devplat-core';

import {
  createArtifactEnvelope,
  describeArtifactEnvelope,
} from '../artifact-envelope/logic.js';
import type { RebaseResultArtifact } from './codec.js';
import { REBASE_RESULT_ARTIFACT_VERSION } from './constants.js';

/**
 * Normalizes a rebase result artifact before persistence.
 */
export function createRebaseResultArtifact(
  input: RebaseResultArtifact,
): RebaseResultArtifact {
  return createArtifactEnvelope({
    ...input,
    artifactType: ARTIFACT_TYPE_REBASE_RESULT,
    version: REBASE_RESULT_ARTIFACT_VERSION,
    payload: {
      ...input.payload,
      resultId: input.payload.resultId.trim(),
      baseBranch: input.payload.baseBranch.trim(),
      branchName: input.payload.branchName.trim(),
      details: input.payload.details.trim(),
    },
  });
}

/**
 * Describes a rebase result artifact for branch dependency status output.
 */
export function describeRebaseResultArtifact(
  input: RebaseResultArtifact,
): string {
  return `${describeArtifactEnvelope(input)} :: ${input.payload.branchName} ${input.payload.rebased ? 'rebased' : 'not rebased'}`;
}
