import type {
  ReviewFinding,
  ReviewSummary,
  SpecConformanceSummary,
} from './types.js';

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeSpecConformance(
  input: SpecConformanceSummary,
): SpecConformanceSummary {
  return {
    specId: input.specId.trim(),
    satisfiedCriteria: uniqueTrimmed(input.satisfiedCriteria),
    missingCriteria: uniqueTrimmed(input.missingCriteria),
  };
}

export function createReviewFinding(input: ReviewFinding): ReviewFinding {
  const specConformance =
    input.specConformance === undefined
      ? undefined
      : normalizeSpecConformance(input.specConformance);
  return {
    ...input,
    path: input.path.trim(),
    message: input.message.trim(),
    rationale: input.rationale.trim(),
    fixRecommendation: input.fixRecommendation.trim(),
    blocking:
      input.blocking ||
      input.severity === 'high' ||
      input.severity === 'critical',
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(specConformance === undefined ? {} : { specConformance }),
  };
}

export function isBlockingReviewFinding(input: ReviewFinding): boolean {
  return input.blocking;
}

export function createReviewSummary(input: {
  summaryId: string;
  specId: string;
  findings: readonly ReviewFinding[];
  updatedAt: string;
}): ReviewSummary {
  const findings = input.findings.map(createReviewFinding);
  const conformance = findings
    .map((finding) => finding.specConformance)
    .filter((summary) => summary !== undefined);
  const missingCriteria = uniqueTrimmed(
    conformance.flatMap((summary) => summary.missingCriteria),
  );

  return {
    summaryId: input.summaryId.trim(),
    specId: input.specId.trim(),
    findingIds: uniqueTrimmed(findings.map((finding) => finding.findingId)),
    blockingFindingIds: uniqueTrimmed(
      findings
        .filter(isBlockingReviewFinding)
        .map((finding) => finding.findingId),
    ),
    satisfiedCriteria: uniqueTrimmed(
      conformance.flatMap((summary) => summary.satisfiedCriteria),
    ),
    missingCriteria,
    implementationMatchesSpec:
      missingCriteria.length === 0 &&
      findings.every((finding) => !isBlockingReviewFinding(finding)),
    updatedAt: new Date(input.updatedAt).toISOString(),
  };
}

export function describeReviewFinding(input: ReviewFinding): string {
  return `${input.severity} finding -> ${input.path}`;
}
