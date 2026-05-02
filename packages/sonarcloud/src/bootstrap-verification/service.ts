import {
  createSonarBootstrapVerificationResult,
  describeSonarBootstrapVerificationResult,
  isSonarBootstrapVerificationPassing,
} from './logic.js';
import type {
  SonarBootstrapVerificationInput,
  SonarBootstrapVerificationResult,
} from './codec.js';

export class SonarBootstrapVerificationService {
  public execute(
    input: SonarBootstrapVerificationInput,
  ): SonarBootstrapVerificationResult {
    return createSonarBootstrapVerificationResult(input);
  }

  public passes(input: SonarBootstrapVerificationResult): boolean {
    return isSonarBootstrapVerificationPassing(input);
  }

  public explain(input: SonarBootstrapVerificationResult): string {
    return describeSonarBootstrapVerificationResult(input);
  }
}
