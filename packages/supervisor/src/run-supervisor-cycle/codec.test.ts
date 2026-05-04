import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { SupervisorDecisionCodec } from './codec.js';

describe('run supervisor cycle codecs', () => {
  const cases = [
    {
      name: 'decode valid supervisor lifecycle timestamps',
      inputs: {
        decision: {
          id: 'supervisor-1',
          summary: 'Route to gates.',
          status: 'running',
          trace: ['implementation complete'],
          updatedAt: '2026-04-04T00:00:00.000Z',
          action: 'route',
          nextState: 'review',
          approved: true,
          notes: ['Gates passed.'],
        },
      },
      mock: ({ decision }) =>
        decodeWithCodec(SupervisorDecisionCodec, decision),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid supervisor lifecycle timestamps',
      inputs: {
        decision: {
          id: 'supervisor-1',
          summary: 'Route to gates.',
          status: 'running',
          trace: ['implementation complete'],
          updatedAt: 'April 4, 2026',
          action: 'route',
          nextState: 'review',
          approved: true,
          notes: ['Gates passed.'],
        },
      },
      mock: ({ decision }) =>
        decodeWithCodec(SupervisorDecisionCodec, decision),
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
