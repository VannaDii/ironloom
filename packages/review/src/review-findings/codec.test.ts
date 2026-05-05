import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { ReviewFindingCodec, ReviewSummaryCodec } from './codec.js';

describe('review finding codecs', () => {
  const cases = [
    {
      name: 'decode valid review lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: ReviewFindingCodec,
            value: {
              findingId: 'finding-1',
              severity: 'high',
              path: 'packages/review/src/review-findings/codec.ts',
              message: 'Missing timestamp validation.',
              rationale: 'Review records must be auditable.',
              fixRecommendation: 'Decode timestamps through the shared codec.',
              blocking: true,
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: ReviewSummaryCodec,
            value: {
              summaryId: 'summary-1',
              specId: 'spec-1',
              findingIds: ['finding-1'],
              blockingFindingIds: ['finding-1'],
              satisfiedCriteria: ['Review ran.'],
              missingCriteria: ['Timestamp validation.'],
              implementationMatchesSpec: false,
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
      name: 'reject invalid review lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: ReviewFindingCodec,
            value: {
              findingId: 'finding-1',
              severity: 'high',
              path: 'packages/review/src/review-findings/codec.ts',
              message: 'Missing timestamp validation.',
              rationale: 'Review records must be auditable.',
              fixRecommendation: 'Decode timestamps through the shared codec.',
              blocking: true,
              updatedAt: '2026-04-04',
            },
          },
          {
            codec: ReviewSummaryCodec,
            value: {
              summaryId: 'summary-1',
              specId: 'spec-1',
              findingIds: ['finding-1'],
              blockingFindingIds: ['finding-1'],
              satisfiedCriteria: ['Review ran.'],
              missingCriteria: ['Timestamp validation.'],
              implementationMatchesSpec: false,
              updatedAt: 'April 4, 2026',
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
