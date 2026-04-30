import type { NormalizedSonarIssue, SonarQualityGateResult } from './types.js';

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

export function isQualityGatePassing(input: SonarQualityGateResult): boolean {
  return input.status === 'passed';
}

export function describeSonarQualityGateResult(
  input: SonarQualityGateResult,
): string {
  return `${input.projectKey} -> ${input.status}`;
}
