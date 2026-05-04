import * as t from 'io-ts';

import { IsoTimestampCodec } from '@vannadii/devplat-core';

/** Codec for an implementation conformance summary against a spec. */
export const SpecConformanceSummaryCodec = t.type({
  specId: t.string,
  satisfiedCriteria: t.array(t.string),
  missingCriteria: t.array(t.string),
});

/** Codec for a durable review finding. */
export const ReviewFindingCodec = t.intersection([
  t.type({
    findingId: t.string,
    severity: t.union([
      t.literal('low'),
      t.literal('medium'),
      t.literal('high'),
      t.literal('critical'),
    ]),
    path: t.string,
    message: t.string,
    rationale: t.string,
    fixRecommendation: t.string,
    blocking: t.boolean,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    source: t.union([
      t.literal('automated'),
      t.literal('sonar'),
      t.literal('human'),
    ]),
    specConformance: SpecConformanceSummaryCodec,
  }),
]);

/** Codec for a durable review summary used for PR projection. */
export const ReviewSummaryCodec = t.type({
  summaryId: t.string,
  specId: t.string,
  findingIds: t.array(t.string),
  blockingFindingIds: t.array(t.string),
  satisfiedCriteria: t.array(t.string),
  missingCriteria: t.array(t.string),
  implementationMatchesSpec: t.boolean,
  updatedAt: IsoTimestampCodec,
});

/** Summary of implementation conformance to a spec. */
export type SpecConformanceSummary = t.TypeOf<
  typeof SpecConformanceSummaryCodec
>;

/** Durable review finding. */
export type ReviewFinding = t.TypeOf<typeof ReviewFindingCodec>;

/** Severity assigned to a review finding. */
export type ReviewSeverity = ReviewFinding['severity'];

/** Source of a review finding. */
export type ReviewFindingSource = NonNullable<ReviewFinding['source']>;

/** Durable review summary for PR projection. */
export type ReviewSummary = t.TypeOf<typeof ReviewSummaryCodec>;
