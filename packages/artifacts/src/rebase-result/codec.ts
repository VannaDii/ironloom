import * as t from 'io-ts';

import {
  ARTIFACT_TYPE_REBASE_RESULT,
  GitBranchNameCodec,
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

import { REBASE_RESULT_ARTIFACT_VERSION } from './constants.js';

/**
 * Codec for dependent branch rebase result payloads.
 */
export const RebaseResultPayloadCodec = t.type({
  resultId: t.string,
  mergedPrNumber: t.number,
  baseBranch: GitBranchNameCodec,
  branchName: GitBranchNameCodec,
  rebased: t.boolean,
  conflictsDetected: t.boolean,
  details: t.string,
});

/**
 * Codec for dependent branch rebase result artifacts.
 */
export const RebaseResultArtifactCodec = t.type({
  id: t.string,
  artifactType: t.literal(ARTIFACT_TYPE_REBASE_RESULT),
  version: t.literal(REBASE_RESULT_ARTIFACT_VERSION),
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  payload: RebaseResultPayloadCodec,
});

/**
 * Rebase result payload derived from the source codec.
 */
export type RebaseResultPayload = t.TypeOf<typeof RebaseResultPayloadCodec>;

/**
 * Rebase result artifact derived from the source codec.
 */
export type RebaseResultArtifact = t.TypeOf<typeof RebaseResultArtifactCodec>;
