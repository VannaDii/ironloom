import * as t from 'io-ts';

import {
  ARTIFACT_TYPE_APPROVAL_RECORD,
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

import { APPROVAL_RECORD_ARTIFACT_VERSION } from './constants.js';

/**
 * Codec for the lifecycle subject covered by an approval decision.
 */
export const ApprovalSubjectTypeCodec = t.union([
  t.literal('spec'),
  t.literal('slice'),
  t.literal('pull-request'),
  t.literal('merge'),
]);

/**
 * Codec for operator approval outcomes.
 */
export const ApprovalDecisionCodec = t.union([
  t.literal('approved'),
  t.literal('rejected'),
  t.literal('needs-changes'),
]);

/**
 * Codec for the payload carried by approval record artifacts.
 */
export const ApprovalRecordPayloadCodec = t.type({
  approvalId: t.string,
  subjectType: ApprovalSubjectTypeCodec,
  subjectId: t.string,
  actorId: t.string,
  decision: ApprovalDecisionCodec,
  rationale: t.string,
});

/**
 * Codec for auditable operator approval artifacts.
 */
export const ApprovalRecordArtifactCodec = t.type({
  id: t.string,
  artifactType: t.literal(ARTIFACT_TYPE_APPROVAL_RECORD),
  version: t.literal(APPROVAL_RECORD_ARTIFACT_VERSION),
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  payload: ApprovalRecordPayloadCodec,
});

/**
 * Approval subject type derived from the source codec.
 */
export type ApprovalSubjectType = t.TypeOf<typeof ApprovalSubjectTypeCodec>;

/**
 * Approval decision derived from the source codec.
 */
export type ApprovalDecision = t.TypeOf<typeof ApprovalDecisionCodec>;

/**
 * Approval artifact payload derived from the source codec.
 */
export type ApprovalRecordPayload = t.TypeOf<typeof ApprovalRecordPayloadCodec>;

/**
 * Approval artifact record derived from the source codec.
 */
export type ApprovalRecordArtifact = t.TypeOf<
  typeof ApprovalRecordArtifactCodec
>;
