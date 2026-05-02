import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  DiscordGatewayDispatchEventCodec,
  DiscordGatewayInteractionCreateEventCodec,
  DiscordInteractionGatewayResultCodec,
} from './codec.js';

describe('discord interaction gateway codecs', () => {
  const cases = [
    {
      name: 'decodes Gateway interaction dispatches and handled results',
      inputs: {
        event: {
          op: 0,
          t: 'INTERACTION_CREATE',
          s: 1,
          d: {
            id: 'interaction-1',
            token: 'token-1',
            channel_id: 'thread-1',
            data: {
              custom_id: 'devplat:v1:show-status:thread-1',
            },
            user: {
              id: 'operator-1',
            },
          },
        },
        result: {
          status: 'handled',
          interactionId: 'interaction-1',
          threadId: 'thread-1',
          controlResult: {
            request: {
              id: 'interaction-1',
              summary: 'show-status',
              status: 'running',
              trace: [],
              updatedAt: '2026-05-01T00:00:00.000Z',
              actorId: 'operator-1',
              threadId: 'thread-1',
              channelId: 'thread-1',
              action: 'show-status',
              privileged: false,
            },
            policyDecisionId: 'policy-1',
            allowed: true,
            persistedKey: 'interaction-1',
            failedClosed: false,
          },
        },
      },
      mock: (inputs: { event: unknown; result: unknown }) => ({
        dispatch: decodeWithCodec(
          DiscordGatewayDispatchEventCodec,
          inputs.event,
        ),
        interaction: decodeWithCodec(
          DiscordGatewayInteractionCreateEventCodec,
          inputs.event,
        ),
        result: decodeWithCodec(
          DiscordInteractionGatewayResultCodec,
          inputs.result,
        ),
      }),
      assert: (decoded: {
        dispatch: ReturnType<
          typeof decodeWithCodec<typeof DiscordGatewayDispatchEventCodec>
        >;
        interaction: ReturnType<
          typeof decodeWithCodec<
            typeof DiscordGatewayInteractionCreateEventCodec
          >
        >;
        result: ReturnType<
          typeof decodeWithCodec<typeof DiscordInteractionGatewayResultCodec>
        >;
      }) => {
        expect(decoded.dispatch.ok).toBe(true);
        expect(decoded.interaction.ok).toBe(true);
        expect(decoded.result.ok).toBe(true);
      },
    },
    {
      name: 'rejects non-dispatch opcodes and malformed interaction payloads',
      inputs: {
        event: {
          op: 10,
          t: 'INTERACTION_CREATE',
          d: {
            id: 'interaction-1',
          },
        },
        result: {
          status: 'rejected',
          eventName: 'INTERACTION_CREATE',
          reason: 'missing token',
        },
      },
      mock: (inputs: { event: unknown; result: unknown }) => ({
        dispatch: decodeWithCodec(
          DiscordGatewayDispatchEventCodec,
          inputs.event,
        ),
        interaction: decodeWithCodec(
          DiscordGatewayInteractionCreateEventCodec,
          inputs.event,
        ),
        result: decodeWithCodec(
          DiscordInteractionGatewayResultCodec,
          inputs.result,
        ),
      }),
      assert: (decoded: {
        dispatch: ReturnType<
          typeof decodeWithCodec<typeof DiscordGatewayDispatchEventCodec>
        >;
        interaction: ReturnType<
          typeof decodeWithCodec<
            typeof DiscordGatewayInteractionCreateEventCodec
          >
        >;
        result: ReturnType<
          typeof decodeWithCodec<typeof DiscordInteractionGatewayResultCodec>
        >;
      }) => {
        expect(decoded.dispatch.ok).toBe(false);
        expect(decoded.interaction.ok).toBe(false);
        expect(decoded.result.ok).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    const decoded = testCase.mock(testCase.inputs);
    testCase.assert(decoded);
  });
});
