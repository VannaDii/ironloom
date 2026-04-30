import type * as t from 'io-ts';

import type {
  ReviewFindingCodec,
  ReviewSummaryCodec,
  SpecConformanceSummaryCodec,
} from './codec.js';

export type SpecConformanceSummary = t.TypeOf<
  typeof SpecConformanceSummaryCodec
>;

export type ReviewFinding = t.TypeOf<typeof ReviewFindingCodec>;

export type ReviewSeverity = ReviewFinding['severity'];

export type ReviewFindingSource = NonNullable<ReviewFinding['source']>;

export type ReviewSummary = t.TypeOf<typeof ReviewSummaryCodec>;
