import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { DiscordApprovalRequestCodec } from './codec.js';

describe('interactive approval codecs', () => {
  const cases = [
    {
      name: 'decode valid approval lifecycle timestamps',
      inputs: {
        request: {
          id: 'approval-1',
          summary: 'Approve spec.',
          status: 'review',
          trace: ['requested approval'],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'operator-1',
          channelId: 'channel-1',
          threadId: 'thread-1',
          action: 'approve',
          artifactId: 'artifact-1',
          privileged: false,
        },
      },
      mock: ({ request }) =>
        decodeWithCodec(DiscordApprovalRequestCodec, request),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid approval lifecycle timestamps',
      inputs: {
        request: {
          id: 'approval-1',
          summary: 'Approve spec.',
          status: 'review',
          trace: ['requested approval'],
          updatedAt: '2026-04-04',
          actorId: 'operator-1',
          channelId: 'channel-1',
          threadId: 'thread-1',
          action: 'approve',
          artifactId: 'artifact-1',
          privileged: false,
        },
      },
      mock: ({ request }) =>
        decodeWithCodec(DiscordApprovalRequestCodec, request),
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
