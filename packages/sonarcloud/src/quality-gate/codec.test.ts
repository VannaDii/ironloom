import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';
import type { DevplatResult } from '@vannadii/devplat-core';

import { SonarQualityGateResultCodec } from './codec.js';

describe('Sonar quality gate codecs', () => {
  const cases = [
    {
      name: 'decode valid Sonar quality gate lifecycle timestamps',
      inputs: {
        value: {
          projectKey: 'vannadii_devplat',
          status: 'passed',
          overallCoverage: 95,
          newCodeCoverage: 95,
          blockingIssues: 0,
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: ({ value }) => decodeWithCodec(SonarQualityGateResultCodec, value),
      assert: (decodedValue: DevplatResult<unknown>) => {
        expect(decodedValue.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid Sonar quality gate lifecycle timestamps',
      inputs: {
        value: {
          projectKey: 'vannadii_devplat',
          status: 'failed',
          overallCoverage: 88,
          newCodeCoverage: 89,
          blockingIssues: 1,
          evaluatedAt: '2026-04-04',
        },
      },
      mock: ({ value }) => decodeWithCodec(SonarQualityGateResultCodec, value),
      assert: (decodedValue: DevplatResult<unknown>) => {
        expect(decodedValue.ok).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    const decodedValue = testCase.mock(testCase.inputs);

    testCase.assert(decodedValue);
  });
});
