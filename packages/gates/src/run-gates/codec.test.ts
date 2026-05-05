import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { GateRemediationHookCodec, GateRunReportCodec } from './codec.js';

describe('run gates codecs', () => {
  const cases = [
    {
      name: 'decode valid gate lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: GateRemediationHookCodec,
            value: {
              hookId: 'hook-1',
              gateRunReportId: 'gates-1',
              failedGateNames: ['test'],
              retryableGateNames: ['test'],
              remediationFindingIds: ['finding-1'],
              actions: ['Retry test gate.'],
              autofixEligible: false,
              approvalRequired: false,
              nextAction: 'retry-gates',
              createdAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: GateRunReportCodec,
            value: {
              id: 'gates-1',
              summary: 'Gate report.',
              status: 'failed',
              trace: ['test failed'],
              updatedAt: '2026-04-04T00:00:00.000Z',
              passed: false,
              results: [
                {
                  name: 'test',
                  success: false,
                  detail: 'Unit test failed.',
                },
              ],
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject invalid gate lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: GateRemediationHookCodec,
            value: {
              hookId: 'hook-1',
              gateRunReportId: 'gates-1',
              failedGateNames: ['test'],
              retryableGateNames: ['test'],
              remediationFindingIds: ['finding-1'],
              actions: ['Retry test gate.'],
              autofixEligible: false,
              approvalRequired: false,
              nextAction: 'retry-gates',
              createdAt: '2026-04-04',
            },
          },
          {
            codec: GateRunReportCodec,
            value: {
              id: 'gates-1',
              summary: 'Gate report.',
              status: 'failed',
              trace: ['test failed'],
              updatedAt: 'not-a-date',
              passed: false,
              results: [
                {
                  name: 'test',
                  success: false,
                  detail: 'Unit test failed.',
                },
              ],
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
