import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { ResearchBriefCodec } from './codec.js';

describe('research brief codecs', () => {
  const cases = [
    {
      name: 'decode valid research lifecycle timestamps',
      inputs: {
        brief: {
          researchId: 'research-1',
          topic: 'Discord operator controls',
          question: 'How should operator actions be routed?',
          constraints: ['Fail closed on ambiguous context.'],
          findings: ['Use bound thread context.'],
          recommendation: 'Route through the control plane.',
          sourceUrls: ['https://example.com/control-plane'],
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: ({ brief }) => decodeWithCodec(ResearchBriefCodec, brief),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid research lifecycle timestamps',
      inputs: {
        brief: {
          researchId: 'research-1',
          topic: 'Discord operator controls',
          question: 'How should operator actions be routed?',
          constraints: ['Fail closed on ambiguous context.'],
          findings: ['Use bound thread context.'],
          recommendation: 'Route through the control plane.',
          sourceUrls: ['https://example.com/control-plane'],
          updatedAt: '04/04/2026',
        },
      },
      mock: ({ brief }) => decodeWithCodec(ResearchBriefCodec, brief),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    const outcome = testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
