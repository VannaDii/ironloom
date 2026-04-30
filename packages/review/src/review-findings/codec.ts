import * as t from 'io-ts';

export const SpecConformanceSummaryCodec = t.type({
  specId: t.string,
  satisfiedCriteria: t.array(t.string),
  missingCriteria: t.array(t.string),
});

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
    updatedAt: t.string,
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

export const ReviewSummaryCodec = t.type({
  summaryId: t.string,
  specId: t.string,
  findingIds: t.array(t.string),
  blockingFindingIds: t.array(t.string),
  satisfiedCriteria: t.array(t.string),
  missingCriteria: t.array(t.string),
  implementationMatchesSpec: t.boolean,
  updatedAt: t.string,
});
