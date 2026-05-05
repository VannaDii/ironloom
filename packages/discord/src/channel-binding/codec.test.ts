import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { DiscordChannelBindingCodec } from './codec.js';

describe('channel binding codecs', () => {
  const cases = [
    {
      name: 'decode valid channel binding lifecycle timestamps',
      inputs: {
        binding: {
          id: 'binding-1',
          summary: 'Spec channel binding.',
          status: 'approved',
          trace: ['bound channel'],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-1',
          kind: 'spec',
          threadBindingMode: 'inherit-parent',
        },
      },
      mock: ({ binding }) =>
        decodeWithCodec(DiscordChannelBindingCodec, binding),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid channel binding lifecycle timestamps',
      inputs: {
        binding: {
          id: 'binding-1',
          summary: 'Spec channel binding.',
          status: 'approved',
          trace: ['bound channel'],
          updatedAt: 'April 4, 2026',
          guildId: 'guild-1',
          channelId: 'channel-1',
          kind: 'spec',
          threadBindingMode: 'inherit-parent',
        },
      },
      mock: ({ binding }) =>
        decodeWithCodec(DiscordChannelBindingCodec, binding),
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
