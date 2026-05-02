import { describe, expect, it } from 'vitest';

import { SonarBootstrapVerificationService } from './service.js';
import type { SonarBootstrapVerificationInput } from './codec.js';

type SonarBootstrapVerificationServiceCase = {
  name: string;
  inputs: {
    verification: SonarBootstrapVerificationInput;
  };
  mock: () => {
    service: SonarBootstrapVerificationService;
  };
  assert: (
    context: { service: SonarBootstrapVerificationService },
    inputs: { verification: SonarBootstrapVerificationInput },
  ) => void;
};

describe('SonarBootstrapVerificationService', () => {
  const cases = [
    {
      name: 'evaluates bootstrap verification snapshots',
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
              actualValue: '99.2',
            },
          ],
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new SonarBootstrapVerificationService(),
      }),
      assert: (context, inputs) => {
        const result = context.service.execute(inputs.verification);

        expect(context.service.passes(result)).toBe(true);
        expect(context.service.explain(result)).toContain('passed');
      },
    },
    {
      name: 'reports failed bootstrap verification snapshots',
      inputs: {
        verification: {
          projectKey: 'vannadii_devplat',
          qualityGateStatus: 'ERROR',
          conditions: [
            {
              metricKey: 'coverage',
              comparator: 'LT',
              errorThreshold: '90',
              actualValue: '75.0',
            },
            {
              metricKey: 'new_coverage',
              comparator: 'LT',
              errorThreshold: '90',
              actualValue: '70.0',
            },
          ],
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new SonarBootstrapVerificationService(),
      }),
      assert: (context, inputs) => {
        const result = context.service.execute(inputs.verification);

        expect(context.service.passes(result)).toBe(false);
        expect(result.issues).toContain(
          'Sonar quality gate status is ERROR, expected OK.',
        );
      },
    },
  ] satisfies SonarBootstrapVerificationServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
