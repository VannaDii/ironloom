import {
  createReviewFinding,
  type ReviewFinding,
} from '@vannadii/devplat-review';

import type { NormalizedSonarIssue, SonarQualityGateResult } from './codec.js';

/** Normalizes sonar issue. */
export function normalizeSonarIssue(
  input: NormalizedSonarIssue,
): NormalizedSonarIssue {
  const effortMinutes = Math.max(0, Math.trunc(input.effortMinutes));
  return {
    ...input,
    issueKey: input.issueKey.trim(),
    path: input.path.trim(),
    message: input.message.trim(),
    effortMinutes,
    blocking:
      input.blocking ||
      input.severity === 'critical' ||
      input.severity === 'blocker',
  };
}

/** Creates sonar quality gate result. */
export function createSonarQualityGateResult(
  input: SonarQualityGateResult,
): SonarQualityGateResult {
  const overallCoverage = Math.min(100, Math.max(0, input.overallCoverage));
  const newCodeCoverage = Math.min(100, Math.max(0, input.newCodeCoverage));
  const issues = input.issues?.map(normalizeSonarIssue);
  const blockingIssues =
    issues === undefined
      ? input.blockingIssues
      : issues.filter((issue) => issue.blocking).length;
  const status =
    overallCoverage >= 90 && newCodeCoverage >= 90 && blockingIssues === 0
      ? 'passed'
      : 'failed';

  return {
    ...input,
    status,
    overallCoverage,
    newCodeCoverage,
    blockingIssues,
    evaluatedAt: new Date(input.evaluatedAt).toISOString(),
    ...(issues === undefined ? {} : { issues }),
    nextAction:
      input.nextAction ?? (status === 'passed' ? 'continue' : 'review-sonar'),
  };
}

/** Maps sonar severity to review severity. */
function mapSonarSeverityToReviewSeverity(
  input: NormalizedSonarIssue['severity'],
): ReviewFinding['severity'] {
  if (input === 'blocker') {
    return 'critical';
  }

  if (input === 'critical') {
    return 'high';
  }

  if (input === 'major') {
    return 'medium';
  }

  return 'low';
}

/** Creates sonar issue rationale. */
function createSonarIssueRationale(input: NormalizedSonarIssue): string {
  return `Sonar issue ${input.issueKey} reported ${input.severity} severity with ${String(input.effortMinutes)} minutes of estimated effort.`;
}

/** Creates sonar issue fix recommendation. */
function createSonarIssueFixRecommendation(
  input: NormalizedSonarIssue,
): string {
  return `Resolve the Sonar finding in ${input.path}: ${input.message}`;
}

/** Creates review finding from sonar issue. */
export function createReviewFindingFromSonarIssue(
  input: NormalizedSonarIssue,
  updatedAt: string,
): ReviewFinding {
  const issue = normalizeSonarIssue(input);
  return createReviewFinding({
    findingId: `sonar:${issue.issueKey}`,
    severity: mapSonarSeverityToReviewSeverity(issue.severity),
    path: issue.path,
    message: issue.message,
    rationale: createSonarIssueRationale(issue),
    fixRecommendation: createSonarIssueFixRecommendation(issue),
    blocking: issue.blocking,
    updatedAt,
    source: 'sonar',
  });
}

/** Creates review findings from sonar quality gate. */
export function createReviewFindingsFromSonarQualityGate(
  input: SonarQualityGateResult,
): ReviewFinding[] {
  const result = createSonarQualityGateResult(input);
  return (result.issues ?? []).map((issue) =>
    createReviewFindingFromSonarIssue(issue, result.evaluatedAt),
  );
}

/** Returns whether the quality gate is passing. */
export function isQualityGatePassing(input: SonarQualityGateResult): boolean {
  return input.status === 'passed';
}

/** Describes sonar quality gate result. */
export function describeSonarQualityGateResult(
  input: SonarQualityGateResult,
): string {
  return `${input.projectKey} -> ${input.status}`;
}
