import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  RemediationPlanCodec,
  RemediationResultCodec,
  RemediationResultSummaryCodec,
} from './codec.js';

describe('remediation plan codecs', () => {
  const cases = [
    {
      name: 'decode valid remediation lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: RemediationResultCodec,
            value: {
              action: 'Update codec.',
              success: true,
              detail: 'Timestamp validation added.',
              completedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: RemediationPlanCodec,
            value: {
              planId: 'plan-1',
              findingIds: ['finding-1'],
              actions: ['Update codec.'],
              autofix: false,
              approvalRequired: true,
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: RemediationResultSummaryCodec,
            value: {
              planId: 'plan-1',
              successfulActions: ['Update codec.'],
              failedActions: [],
              artifactIds: ['artifact-1'],
              unresolvedFindingIds: [],
              complete: true,
              updatedAt: '2026-04-04T00:00:00.000Z',
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
      name: 'reject invalid remediation lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: RemediationResultCodec,
            value: {
              action: 'Update codec.',
              success: true,
              detail: 'Timestamp validation added.',
              completedAt: '2026-04-04',
            },
          },
          {
            codec: RemediationPlanCodec,
            value: {
              planId: 'plan-1',
              findingIds: ['finding-1'],
              actions: ['Update codec.'],
              autofix: false,
              approvalRequired: true,
              updatedAt: 'April 4, 2026',
            },
          },
          {
            codec: RemediationResultSummaryCodec,
            value: {
              planId: 'plan-1',
              successfulActions: ['Update codec.'],
              failedActions: [],
              artifactIds: ['artifact-1'],
              unresolvedFindingIds: [],
              complete: true,
              updatedAt: 'not-a-date',
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
