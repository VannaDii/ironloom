import {
  createSonarQualityGateResult,
  createReviewFindingsFromSonarQualityGate,
  describeSonarQualityGateResult,
  isQualityGatePassing,
} from './logic.js';
import type { ReviewFinding } from '@vannadii/devplat-review';
import type { SonarQualityGateResult } from './codec.js';

/** Sonar quality gate service service. */
export class SonarQualityGateService {
  /** Evaluate. */
  public evaluate(
    projectKey: string,
    overallCoverage: number,
    newCodeCoverage: number,
    blockingIssues: number,
  ): SonarQualityGateResult {
    return createSonarQualityGateResult({
      projectKey,
      status: 'failed',
      overallCoverage,
      newCodeCoverage,
      blockingIssues,
      evaluatedAt: new Date().toISOString(),
    });
  }

  /** Executes the service operation. */
  public execute(input: SonarQualityGateResult): SonarQualityGateResult {
    return createSonarQualityGateResult(input);
  }

  /** Passes. */
  public passes(input: SonarQualityGateResult): boolean {
    return isQualityGatePassing(createSonarQualityGateResult(input));
  }

  /** Converts the result to review findings. */
  public toReviewFindings(input: SonarQualityGateResult): ReviewFinding[] {
    return createReviewFindingsFromSonarQualityGate(input);
  }

  /** Describes the service result for operators. */
  public explain(input: SonarQualityGateResult): string {
    return describeSonarQualityGateResult(input);
  }
}
