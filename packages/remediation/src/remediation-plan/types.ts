import type * as t from 'io-ts';

import type {
  RemediationPlanCodec,
  RemediationResultCodec,
  RemediationResultSummaryCodec,
} from './codec.js';

export type RemediationResult = t.TypeOf<typeof RemediationResultCodec>;

export type RemediationPlan = t.TypeOf<typeof RemediationPlanCodec>;

export type RemediationResultSummary = t.TypeOf<
  typeof RemediationResultSummaryCodec
>;
