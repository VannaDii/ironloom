import * as t from 'io-ts';

import { IsoTimestampCodec } from '@vannadii/devplat-core';

/** Codec for the result of one remediation action. */
export const RemediationResultCodec = t.intersection([
  t.type({
    action: t.string,
    success: t.boolean,
    detail: t.string,
    completedAt: IsoTimestampCodec,
  }),
  t.partial({
    artifactId: t.string,
  }),
]);

/** Codec for a durable remediation plan for review or gate failures. */
export const RemediationPlanCodec = t.intersection([
  t.type({
    planId: t.string,
    findingIds: t.array(t.string),
    actions: t.array(t.string),
    autofix: t.boolean,
    approvalRequired: t.boolean,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    results: t.array(RemediationResultCodec),
    unresolvedFindingIds: t.array(t.string),
    nextAction: t.string,
  }),
]);

/** Codec for an aggregate remediation result for PR and supervisor routing. */
export const RemediationResultSummaryCodec = t.type({
  planId: t.string,
  successfulActions: t.array(t.string),
  failedActions: t.array(t.string),
  artifactIds: t.array(t.string),
  unresolvedFindingIds: t.array(t.string),
  complete: t.boolean,
  updatedAt: IsoTimestampCodec,
});

/** Result of one remediation action. */
export type RemediationResult = t.TypeOf<typeof RemediationResultCodec>;

/** Durable remediation plan for review or gate failures. */
export type RemediationPlan = t.TypeOf<typeof RemediationPlanCodec>;

/** Aggregate remediation result for PR and supervisor routing. */
export type RemediationResultSummary = t.TypeOf<
  typeof RemediationResultSummaryCodec
>;
