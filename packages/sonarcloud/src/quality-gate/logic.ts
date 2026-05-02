import {
  createReviewFinding,
  type ReviewFinding,
} from '@vannadii/devplat-review';

import type { NormalizedSonarIssue, SonarQualityGateResult } from './codec.js';

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

function createSonarIssueRationale(input: NormalizedSonarIssue): string {
  return `Sonar issue ${input.issueKey} reported ${input.severity} severity with ${String(input.effortMinutes)} minutes of estimated effort.`;
}

function createSonarIssueFixRecommendation(
  input: NormalizedSonarIssue,
): string {
  return `Resolve the Sonar finding in ${input.path}: ${input.message}`;
}

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

export function createReviewFindingsFromSonarQualityGate(
  input: SonarQualityGateResult,
): ReviewFinding[] {
  const result = createSonarQualityGateResult(input);
  return (result.issues ?? []).map((issue) =>
    createReviewFindingFromSonarIssue(issue, result.evaluatedAt),
  );
}

export function isQualityGatePassing(input: SonarQualityGateResult): boolean {
  return input.status === 'passed';
}

export function describeSonarQualityGateResult(
  input: SonarQualityGateResult,
): string {
  return `${input.projectKey} -> ${input.status}`;
}
