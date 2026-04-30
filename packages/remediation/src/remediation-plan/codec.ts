import * as t from 'io-ts';

export const RemediationResultCodec = t.intersection([
  t.type({
    action: t.string,
    success: t.boolean,
    detail: t.string,
    completedAt: t.string,
  }),
  t.partial({
    artifactId: t.string,
  }),
]);

export const RemediationPlanCodec = t.intersection([
  t.type({
    planId: t.string,
    findingIds: t.array(t.string),
    actions: t.array(t.string),
    autofix: t.boolean,
    approvalRequired: t.boolean,
    updatedAt: t.string,
  }),
  t.partial({
    results: t.array(RemediationResultCodec),
    unresolvedFindingIds: t.array(t.string),
    nextAction: t.string,
  }),
]);

export const RemediationResultSummaryCodec = t.type({
  planId: t.string,
  successfulActions: t.array(t.string),
  failedActions: t.array(t.string),
  artifactIds: t.array(t.string),
  unresolvedFindingIds: t.array(t.string),
  complete: t.boolean,
  updatedAt: t.string,
});
