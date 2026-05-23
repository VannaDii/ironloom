import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  DiscordInteractionCallbackCodec,
  DiscordInteractionCallbackOptionsCodec,
  DiscordControlResultCodec,
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
      name: 'decode control results that preserve post-acknowledgement thread post failures',
      inputs: {
        values: [
          {
            request: {
              id: 'control-result-1',
              summary: 'Show status.',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              actorId: 'operator-1',
              threadId: 'thread-1',
              channelId: 'channel-1',
              action: 'show-status',
              privileged: false,
            },
            policyDecisionId: 'policy-1',
            allowed: true,
            persistedKey: 'control-result-1',
            failedClosed: false,
            responseReceipt: {
              endpoint: '/interactions/control-result-1/token/callback',
              statusCode: 200,
              responseBody: { ok: true },
            },
            responsePayload: {
              content: 'acknowledged',
            },
            threadPayload: {
              content: 'thread update',
            },
            completionReceipt: {
              endpoint: '/webhooks/application/token',
              statusCode: 200,
              responseBody: { ok: true },
            },
            threadPostError: 'thread message rejected',
          },
          {
            request: {
              id: 'control-result-2',
              summary: 'Show status.',
              status: 'blocked',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              actorId: 'operator-2',
              threadId: 'thread-2',
              channelId: 'channel-2',
              action: 'show-status',
              privileged: false,
            },
            policyDecisionId: 'discord-response-rejected',
            allowed: false,
            persistedKey: 'control-result-2',
            failedClosed: true,
            responseReceipt: {
              endpoint: '/interactions/control-result-2/token/callback',
              statusCode: 404,
              responseBody: { message: 'Unknown interaction' },
            },
            responsePayload: {
              content: 'blocked',
            },
            responsePostError:
              'Discord interaction acknowledgement returned HTTP 404.',
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordControlResultCodec, value),
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
      name: 'reject invalid control and interaction lifecycle timestamps',
      inputs: {
        values: [
          {
            codec: DiscordControlRequestCodec,
            value: {
              id: 'control-invalid-timestamp',
              summary: 'Show status.',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04',
              actorId: 'operator-1',
              threadId: 'thread-1',
              channelId: 'channel-1',
              action: 'show-status',
              privileged: false,
            },
          },
          {
            codec: DiscordOperatorInteractionCodec,
            value: {
              id: 'interaction-invalid-timestamp',
              token: 'token-1',
              actorId: 'operator-1',
              channelId: 'channel-1',
              updatedAt: 'April 4, 2026',
            },
          },
          {
            codec: DiscordInteractionCallbackOptionsCodec,
            value: {
              threadId: 'thread-1',
              updatedAt: 'not-a-date',
            },
          },
        ],
      },
      mock: async ({ values }) =>
        values.map(({ codec, value }) => decodeWithCodec(codec, value)),
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
    {
      name: 'decode operator interactions with bounded received-event snapshots',
      inputs: {
        values: [
          {
            id: 'interaction-received-event',
            token: 'token-received-event',
            actorId: 'operator-1',
            channelId: 'thread-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            receivedEvent: {
              id: 'callback-received-event',
              token: 'callback-token',
              channel_id: 'thread-1',
              data: {
                name: 'run this',
                custom_id: 'devplat:v1:thread-1:run-this',
                options: [{ name: 'unbounded', value: 'ignored' }],
              },
              member: {
                user: {
                  id: 'operator-1',
                  username: 'ignored',
                },
                roles: ['ignored'],
              },
              user: {
                id: 'operator-2',
                global_name: 'ignored',
              },
              resolved: {
                users: {
                  operator: {
                    token: 'ignored',
                  },
                },
              },
            },
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordOperatorInteractionCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues).toEqual([
          {
            ok: true,
            value: {
              id: 'interaction-received-event',
              token: 'token-received-event',
              actorId: 'operator-1',
              channelId: 'thread-1',
              updatedAt: '2026-04-04T00:00:00.000Z',
              receivedEvent: {
                id: 'callback-received-event',
                token: 'callback-token',
                channel_id: 'thread-1',
                data: {
                  name: 'run this',
                  custom_id: 'devplat:v1:thread-1:run-this',
                },
                member: {
                  user: {
                    id: 'operator-1',
                  },
                  roles: ['ignored'],
                },
                user: {
                  id: 'operator-2',
                },
              },
            },
          },
        ]);
      },
    },
    {
      name: 'decode raw Discord callback payloads and binding options',
      inputs: {
        values: [
          {
            codec: DiscordInteractionCallbackCodec,
            value: {
              id: 'callback-1',
              token: 'token-1',
              channel_id: 'thread-1',
              data: {
                name: 'retry-gates',
                custom_id: 'devplat:retry-gates',
              },
              member: {
                user: {
                  id: 'operator-1',
                },
              },
            },
          },
          {
            codec: DiscordInteractionCallbackOptionsCodec,
            value: {
              threadId: 'thread-1',
              boundThreadId: 'thread-1',
              summary: 'Retry gates.',
              privileged: false,
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
        ],
      },
      mock: async ({ values }) =>
        values.map(({ codec, value }) => decodeWithCodec(codec, value)),
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
