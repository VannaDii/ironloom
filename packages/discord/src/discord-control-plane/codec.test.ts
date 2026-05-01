import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  DiscordControlRequestCodec,
  DiscordOperatorInteractionCodec,
} from './codec.js';

describe('discord control request codec', () => {
  const cases = [
    {
      name: 'decode valid control requests including the expanded operator surface',
      inputs: {
        values: [
          {
            id: 'control-1',
            summary: 'Sync the bound worktree.',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            actorId: 'operator-1',
            threadId: 'thread-1',
            channelId: 'channel-1',
            action: 'sync-worktree',
            privileged: true,
          },
          {
            id: 'control-2',
            summary: 'Explain the latest failure.',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            actorId: 'operator-1',
            threadId: 'thread-1',
            channelId: 'channel-1',
            action: 'explain-failure',
            privileged: false,
          },
          {
            id: 'control-3',
            summary: 'Claim the bound work item.',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            actorId: 'operator-1',
            threadId: 'thread-1',
            channelId: 'channel-1',
            action: 'claim-this',
            privileged: false,
            workItem: {
              threadKind: 'implementation',
              threadId: 'thread-1',
              specId: 'spec-1',
              sliceId: 'slice-1',
              artifactId: 'artifact-1',
            },
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordControlRequestCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject invalid control requests',
      inputs: {
        values: [
          {
            id: 'control-4',
            summary: 'Unknown action.',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            actorId: 'operator-1',
            threadId: 'thread-1',
            channelId: 'channel-1',
            action: 'merge-later',
            privileged: false,
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordControlRequestCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
    {
      name: 'decode operator interactions with bound thread sessions',
      inputs: {
        values: [
          {
            id: 'interaction-1',
            token: 'token-1',
            actorId: 'operator-1',
            channelId: 'channel-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            boundSession: {
              id: 'thread-session-1',
              summary: 'Pull request session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-1',
              parentChannelId: 'pull-request-channel',
              threadId: 'thread-1',
              kind: 'pull-request',
              specId: 'spec-1',
              sliceId: 'slice-1',
              pullRequestNumber: 12,
              artifactId: 'artifact-1',
            },
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordOperatorInteractionCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
