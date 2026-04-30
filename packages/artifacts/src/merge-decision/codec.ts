import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const MergeStrategyCodec = t.union([
  t.literal('merge'),
  t.literal('squash'),
  t.literal('rebase'),
]);

export const MergeDecisionPayloadCodec = t.type({
  decisionId: t.string,
  prNumber: t.number,
  actorId: t.string,
  mergeStrategy: MergeStrategyCodec,
  approved: t.boolean,
  rationale: t.string,
  blockingFindings: t.array(t.string),
});

export const MergeDecisionArtifactCodec = t.type({
  id: t.string,
  artifactType: t.literal('merge-decision'),
  version: t.literal(1),
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  payload: MergeDecisionPayloadCodec,
});
