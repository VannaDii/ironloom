import * as t from 'io-ts';

import type { RemediationPlan } from './types.js';

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

export type _RemediationPlanExact =
  t.TypeOf<typeof RemediationPlanCodec> extends RemediationPlan
    ? RemediationPlan extends t.TypeOf<typeof RemediationPlanCodec>
      ? true
      : never
    : never;
