import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const ApprovalSubjectTypeCodec = t.union([
  t.literal('spec'),
  t.literal('slice'),
  t.literal('pull-request'),
  t.literal('merge'),
]);

export const ApprovalDecisionCodec = t.union([
  t.literal('approved'),
  t.literal('rejected'),
  t.literal('needs-changes'),
]);

export const ApprovalRecordPayloadCodec = t.type({
  approvalId: t.string,
  subjectType: ApprovalSubjectTypeCodec,
  subjectId: t.string,
  actorId: t.string,
  decision: ApprovalDecisionCodec,
  rationale: t.string,
});

export const ApprovalRecordArtifactCodec = t.type({
  id: t.string,
  artifactType: t.literal('approval-record'),
  version: t.literal(1),
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  payload: ApprovalRecordPayloadCodec,
});
