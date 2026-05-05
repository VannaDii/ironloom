import type {
  ResearchBrief,
  ResearchCapabilityComparison,
  ResearchFeasibility,
  ResearchSourceAttribution,
} from './codec.js';

/** Unique trimmed. */
function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Normalizes source attribution. */
function normalizeSourceAttribution(
  input: ResearchSourceAttribution,
): ResearchSourceAttribution {
  return {
    url: input.url.trim(),
    title: input.title.trim(),
    claim: input.claim.trim(),
    confidence: input.confidence,
  };
}

/** Normalizes capability comparison. */
function normalizeCapabilityComparison(
  input: ResearchCapabilityComparison,
): ResearchCapabilityComparison {
  return {
    option: input.option.trim(),
    strengths: uniqueTrimmed(input.strengths),
    tradeoffs: uniqueTrimmed(input.tradeoffs),
  };
}

/** Normalizes feasibility. */
function normalizeFeasibility(input: ResearchFeasibility): ResearchFeasibility {
  return {
    feasible: input.feasible,
    blockers: uniqueTrimmed(input.blockers),
    nextQuestions: uniqueTrimmed(input.nextQuestions),
  };
}

/** Creates research brief. */
export function createResearchBrief(input: ResearchBrief): ResearchBrief {
  return {
    ...input,
    topic: input.topic.trim(),
    question: input.question.trim(),
    constraints: uniqueTrimmed(input.constraints),
    findings: uniqueTrimmed(input.findings),
    recommendation: input.recommendation.trim(),
    sourceUrls: uniqueTrimmed(input.sourceUrls),
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(input.sourceAttributions === undefined
      ? {}
      : {
          sourceAttributions: input.sourceAttributions.map(
            normalizeSourceAttribution,
          ),
        }),
    ...(input.capabilityComparisons === undefined
      ? {}
      : {
          capabilityComparisons: input.capabilityComparisons.map(
            normalizeCapabilityComparison,
          ),
        }),
    ...(input.feasibility === undefined
      ? {}
      : { feasibility: normalizeFeasibility(input.feasibility) }),
  };
}

/** Describes research brief. */
export function describeResearchBrief(input: ResearchBrief): string {
  return `Research brief -> ${input.topic}`;
}
