import * as t from 'io-ts';

import { IsoTimestampCodec } from '@vannadii/devplat-core';

/** Codec for source attribution supporting a research finding. */
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

/** Codec for a capability comparison captured during research. */
export const ResearchCapabilityComparisonCodec = t.type({
  option: t.string,
  strengths: t.array(t.string),
  tradeoffs: t.array(t.string),
});

/** Codec for a feasibility assessment for a research topic. */
export const ResearchFeasibilityCodec = t.type({
  feasible: t.boolean,
  blockers: t.array(t.string),
  nextQuestions: t.array(t.string),
});

/** Codec for a durable research brief used by planning. */
export const ResearchBriefCodec = t.intersection([
  t.type({
    researchId: t.string,
    topic: t.string,
    question: t.string,
    constraints: t.array(t.string),
    findings: t.array(t.string),
    recommendation: t.string,
    sourceUrls: t.array(t.string),
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    sourceAttributions: t.array(ResearchSourceAttributionCodec),
    capabilityComparisons: t.array(ResearchCapabilityComparisonCodec),
    feasibility: ResearchFeasibilityCodec,
  }),
]);

/** Source attribution supporting a research finding. */
export type ResearchSourceAttribution = t.TypeOf<
  typeof ResearchSourceAttributionCodec
>;

/** Capability comparison captured during research. */
export type ResearchCapabilityComparison = t.TypeOf<
  typeof ResearchCapabilityComparisonCodec
>;

/** Feasibility assessment for a research topic. */
export type ResearchFeasibility = t.TypeOf<typeof ResearchFeasibilityCodec>;

/** Durable research brief used by planning. */
export type ResearchBrief = t.TypeOf<typeof ResearchBriefCodec>;
