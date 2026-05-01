import type {
  SonarBootstrapVerificationInput,
  SonarBootstrapVerificationResult,
  SonarQualityGateConditionSnapshot,
} from './codec.js';

function isLessThanComparator(comparator: string): boolean {
  return comparator === 'LESS_THAN' || comparator === 'LT';
}

function resolveCoverageThreshold(
  conditions: SonarQualityGateConditionSnapshot[],
  metricKey: 'coverage' | 'new_coverage',
): number {
  const condition = conditions.find(
    (entry) =>
      entry.metricKey === metricKey && isLessThanComparator(entry.comparator),
  );
  if (condition === undefined) {
    return 0;
  }

  const parsedThreshold = Number(condition.errorThreshold);
  return Number.isFinite(parsedThreshold) ? parsedThreshold : 0;
}

export function createSonarBootstrapVerificationResult(
  input: SonarBootstrapVerificationInput,
): SonarBootstrapVerificationResult {
  const overallCoverageThreshold = resolveCoverageThreshold(
    input.conditions,
    'coverage',
  );
  const newCodeCoverageThreshold = resolveCoverageThreshold(
    input.conditions,
    'new_coverage',
  );
  const checks = {
    qualityGateComputed:
      input.qualityGateStatus !== 'NONE' && input.conditions.length > 0,
    qualityGatePassing: input.qualityGateStatus === 'OK',
    overallCoverageCondition: overallCoverageThreshold >= 90,
    newCodeCoverageCondition: newCodeCoverageThreshold >= 90,
  };
  const issues = [
    ...(checks.qualityGateComputed
      ? []
      : ['Sonar quality gate has not been computed for the project.']),
    ...(checks.qualityGatePassing
      ? []
      : [
          `Sonar quality gate status is ${input.qualityGateStatus}, expected OK.`,
        ]),
    ...(checks.overallCoverageCondition
      ? []
      : [
          `Sonar overall coverage threshold is ${String(overallCoverageThreshold)}, expected at least 90.`,
        ]),
    ...(checks.newCodeCoverageCondition
      ? []
      : [
          `Sonar new-code coverage threshold is ${String(newCodeCoverageThreshold)}, expected at least 90.`,
        ]),
  ];

  return {
    projectKey: input.projectKey,
    status: issues.length === 0 ? 'passed' : 'failed',
    qualityGateStatus: input.qualityGateStatus,
    overallCoverageThreshold,
    newCodeCoverageThreshold,
    checks,
    issues,
    evaluatedAt: new Date(input.evaluatedAt).toISOString(),
  };
}

export function isSonarBootstrapVerificationPassing(
  input: SonarBootstrapVerificationResult,
): boolean {
  return input.status === 'passed';
}

export function describeSonarBootstrapVerificationResult(
  input: SonarBootstrapVerificationResult,
): string {
  return `${input.projectKey} -> ${input.status}`;
}
