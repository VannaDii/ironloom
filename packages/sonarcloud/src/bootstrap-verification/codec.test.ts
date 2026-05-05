import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';
import type { DevplatResult } from '@vannadii/devplat-core';

import {
  SonarBootstrapVerificationInputCodec,
  SonarBootstrapVerificationResultCodec,
} from './codec.js';

describe('Sonar bootstrap verification codecs', () => {
  const cases = [
    {
      name: 'decode valid Sonar bootstrap lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: SonarBootstrapVerificationInputCodec,
            value: {
              projectKey: 'vannadii_devplat',
              qualityGateStatus: 'OK',
              conditions: [
                {
                  metricKey: 'coverage',
                  comparator: 'LT',
                  errorThreshold: '90',
                  actualValue: '99.4',
                },
              ],
              evaluatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: SonarBootstrapVerificationResultCodec,
            value: {
              projectKey: 'vannadii_devplat',
              status: 'passed',
              qualityGateStatus: 'OK',
              overallCoverageThreshold: 90,
              newCodeCoverageThreshold: 90,
              checks: {
                qualityGateComputed: true,
                qualityGatePassing: true,
                overallCoverageCondition: true,
                newCodeCoverageCondition: true,
              },
              issues: [],
              evaluatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues: DevplatResult<unknown>[]) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject invalid Sonar bootstrap lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: SonarBootstrapVerificationInputCodec,
            value: {
              projectKey: 'vannadii_devplat',
              qualityGateStatus: 'OK',
              conditions: [],
              evaluatedAt: '2026-04-04',
            },
          },
          {
            codec: SonarBootstrapVerificationResultCodec,
            value: {
              projectKey: 'vannadii_devplat',
              status: 'failed',
              qualityGateStatus: 'ERROR',
              overallCoverageThreshold: 0,
              newCodeCoverageThreshold: 0,
              checks: {
                qualityGateComputed: true,
                qualityGatePassing: false,
                overallCoverageCondition: false,
                newCodeCoverageCondition: false,
              },
              issues: ['Sonar quality gate status is ERROR, expected OK.'],
              evaluatedAt: 'April 4, 2026',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues: DevplatResult<unknown>[]) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const decodedValues = await testCase.mock(testCase.inputs);

    testCase.assert(decodedValues);
  });
});
