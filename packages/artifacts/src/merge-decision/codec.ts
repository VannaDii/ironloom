import * as t from 'io-ts';

import {
  ARTIFACT_TYPE_MERGE_DECISION,
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

import { MERGE_DECISION_ARTIFACT_VERSION } from './constants.js';

/**
 * Codec for GitHub merge strategies.
 */
export const MergeStrategyCodec = t.union([
  t.literal('merge'),
  t.literal('squash'),
  t.literal('rebase'),
]);

/**
 * Codec for merge readiness decision payloads.
 */
export const MergeDecisionPayloadCodec = t.type({
  decisionId: t.string,
  prNumber: t.number,
  actorId: t.string,
  mergeStrategy: MergeStrategyCodec,
  approved: t.boolean,
  rationale: t.string,
  blockingFindings: t.array(t.string),
});

/**
 * Codec for merge decision artifacts.
 */
export const MergeDecisionArtifactCodec = t.type({
  id: t.string,
  artifactType: t.literal(ARTIFACT_TYPE_MERGE_DECISION),
  version: t.literal(MERGE_DECISION_ARTIFACT_VERSION),
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  payload: MergeDecisionPayloadCodec,
});

/**
 * Merge strategy derived from the source codec.
 */
export type MergeStrategy = t.TypeOf<typeof MergeStrategyCodec>;

/**
 * Merge decision payload derived from the source codec.
 */
export type MergeDecisionPayload = t.TypeOf<typeof MergeDecisionPayloadCodec>;

/**
 * Merge decision artifact derived from the source codec.
 */
export type MergeDecisionArtifact = t.TypeOf<typeof MergeDecisionArtifactCodec>;
