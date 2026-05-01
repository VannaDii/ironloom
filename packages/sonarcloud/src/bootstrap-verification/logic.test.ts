import { describe, expect, it } from 'vitest';

import {
  createSonarBootstrapVerificationResult,
  describeSonarBootstrapVerificationResult,
  isSonarBootstrapVerificationPassing,
} from './logic.js';
import type { SonarBootstrapVerificationInput } from './codec.js';

type SonarBootstrapVerificationLogicCase = {
  name: string;
  inputs: {
    verification: SonarBootstrapVerificationInput;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { verification: SonarBootstrapVerificationInput },
  ) => void;
};

describe('Sonar bootstrap verification logic', () => {
  const cases = [
    {
      name: 'passes when the quality gate is computed, green, and coverage thresholds are at least 90',
      inputs: {
        verification: {
          projectKey: 'vannadii_devplat',
          qualityGateStatus: 'OK',
          conditions: [
            {
              metricKey: 'coverage',
              comparator: 'LT',
              errorThreshold: '90',
              actualValue: '99.4',
            },
            {
              metricKey: 'new_coverage',
              comparator: 'LT',
              errorThreshold: '90',
              actualValue: '99.4',
            },
          ],
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = createSonarBootstrapVerificationResult(
          inputs.verification,
        );

        expect(result.status).toBe('passed');
        expect(result.checks.qualityGatePassing).toBe(true);
        expect(isSonarBootstrapVerificationPassing(result)).toBe(true);
        expect(describeSonarBootstrapVerificationResult(result)).toContain(
          'vannadii_devplat -> passed',
        );
      },
    },
    {
      name: 'fails when the configured thresholds are weaker than required',
      inputs: {
        verification: {
          projectKey: 'vannadii_devplat',
          qualityGateStatus: 'OK',
          conditions: [
            {
              metricKey: 'coverage',
              comparator: 'LT',
              errorThreshold: '80',
              actualValue: '96.0',
            },
            {
              metricKey: 'new_coverage',
              comparator: 'LT',
              errorThreshold: '85',
              actualValue: '97.0',
            },
          ],
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = createSonarBootstrapVerificationResult(
          inputs.verification,
        );

        expect(result.status).toBe('failed');
        expect(result.issues).toContain(
          'Sonar overall coverage threshold is 80, expected at least 90.',
        );
        expect(result.issues).toContain(
          'Sonar new-code coverage threshold is 85, expected at least 90.',
        );
      },
    },
    {
      name: 'fails when the quality gate has not been computed or is not green',
      inputs: {
        verification: {
          projectKey: 'vannadii_devplat',
          qualityGateStatus: 'NONE',
          conditions: [],
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = createSonarBootstrapVerificationResult(
          inputs.verification,
        );

        expect(result.status).toBe('failed');
        expect(result.issues).toContain(
          'Sonar quality gate has not been computed for the project.',
        );
        expect(result.issues).toContain(
          'Sonar quality gate status is NONE, expected OK.',
        );
      },
    },
    {
      name: 'fails closed when Sonar returns non-numeric coverage thresholds',
      inputs: {
        verification: {
          projectKey: 'vannadii_devplat',
          qualityGateStatus: 'OK',
          conditions: [
            {
              metricKey: 'coverage',
              comparator: 'LESS_THAN',
              errorThreshold: 'not-a-number',
              actualValue: '96.0',
            },
            {
              metricKey: 'new_coverage',
              comparator: 'LESS_THAN',
              errorThreshold: '90',
              actualValue: '97.0',
            },
          ],
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = createSonarBootstrapVerificationResult(
          inputs.verification,
        );

        expect(result.status).toBe('failed');
        expect(result.overallCoverageThreshold).toBe(0);
        expect(result.newCodeCoverageThreshold).toBe(90);
        expect(result.issues).toContain(
          'Sonar overall coverage threshold is 0, expected at least 90.',
        );
      },
    },
  ] satisfies SonarBootstrapVerificationLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
