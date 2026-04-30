import * as t from 'io-ts';

export const ResearchSourceAttributionCodec = t.type({
  url: t.string,
  title: t.string,
  claim: t.string,
  confidence: t.union([
    t.literal('low'),
    t.literal('medium'),
    t.literal('high'),
  ]),
});

export const ResearchCapabilityComparisonCodec = t.type({
  option: t.string,
  strengths: t.array(t.string),
  tradeoffs: t.array(t.string),
});

export const ResearchFeasibilityCodec = t.type({
  feasible: t.boolean,
  blockers: t.array(t.string),
  nextQuestions: t.array(t.string),
});

export const ResearchBriefCodec = t.intersection([
  t.type({
    researchId: t.string,
    topic: t.string,
    question: t.string,
    constraints: t.array(t.string),
    findings: t.array(t.string),
    recommendation: t.string,
    sourceUrls: t.array(t.string),
    updatedAt: t.string,
  }),
  t.partial({
    sourceAttributions: t.array(ResearchSourceAttributionCodec),
    capabilityComparisons: t.array(ResearchCapabilityComparisonCodec),
    feasibility: ResearchFeasibilityCodec,
  }),
]);
