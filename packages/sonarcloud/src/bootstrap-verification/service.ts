import {
  createSonarBootstrapVerificationResult,
  describeSonarBootstrapVerificationResult,
  isSonarBootstrapVerificationPassing,
} from './logic.js';
import type {
  SonarBootstrapVerificationInput,
  SonarBootstrapVerificationResult,
} from './codec.js';

/** Sonar bootstrap verification service service. */
export class SonarBootstrapVerificationService {
  /** Executes the service operation. */
  public execute(
    input: SonarBootstrapVerificationInput,
  ): SonarBootstrapVerificationResult {
    return createSonarBootstrapVerificationResult(input);
  }

  /** Passes. */
  public passes(input: SonarBootstrapVerificationResult): boolean {
    return isSonarBootstrapVerificationPassing(input);
  }

  /** Describes the service result for operators. */
  public explain(input: SonarBootstrapVerificationResult): string {
    return describeSonarBootstrapVerificationResult(input);
  }
}
