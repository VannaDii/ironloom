import { describe, expect, it } from 'vitest';

import {
  DISCORD_GATEWAY_DISPATCH_OPCODE,
  DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
} from './constants.js';
import {
  decodeDiscordGatewayInteractionCallback,
  isDiscordGatewayInteractionCreateEvent,
} from './logic.js';
import type { DiscordGatewayDispatchEvent } from './codec.js';

describe('Discord interaction Gateway logic', () => {
  const cases = [
    {
      name: 'recognizes and decodes interaction create dispatches',
      inputs: {
        event: {
          op: DISCORD_GATEWAY_DISPATCH_OPCODE,
          t: DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
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
      },
      mock: (inputs: { event: DiscordGatewayDispatchEvent }) => ({
        interaction: isDiscordGatewayInteractionCreateEvent(inputs.event),
        callback: decodeDiscordGatewayInteractionCallback(inputs.event),
      }),
      assert: (result: {
        interaction: boolean;
        callback: ReturnType<typeof decodeDiscordGatewayInteractionCallback>;
      }) => {
        expect(result.interaction).toBe(true);
        expect(result.callback).toEqual({
          ok: true,
          callback: {
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
        });
      },
    },
    {
      name: 'rejects malformed interaction callback dispatches',
      inputs: {
        event: {
          op: DISCORD_GATEWAY_DISPATCH_OPCODE,
          t: DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
          d: {
            id: 'interaction-2',
          },
        },
      },
      mock: (inputs: { event: DiscordGatewayDispatchEvent }) => ({
        interaction: isDiscordGatewayInteractionCreateEvent(inputs.event),
        callback: decodeDiscordGatewayInteractionCallback(inputs.event),
      }),
      assert: (result: {
        interaction: boolean;
        callback: ReturnType<typeof decodeDiscordGatewayInteractionCallback>;
      }) => {
        expect(result.interaction).toBe(true);
        expect(result.callback).toMatchObject({
          ok: false,
          reason: expect.stringContaining('supported interaction callback'),
        });
      },
    },
    {
      name: 'ignores unrelated dispatch event names',
      inputs: {
        event: {
          op: DISCORD_GATEWAY_DISPATCH_OPCODE,
          t: 'READY',
          s: 2,
          d: {
            session_id: 'session-1',
          },
        },
      },
      mock: (inputs: { event: DiscordGatewayDispatchEvent }) => ({
        interaction: isDiscordGatewayInteractionCreateEvent(inputs.event),
        callback: decodeDiscordGatewayInteractionCallback(inputs.event),
      }),
      assert: (result: {
        interaction: boolean;
        callback: ReturnType<typeof decodeDiscordGatewayInteractionCallback>;
      }) => {
        expect(result.interaction).toBe(false);
        expect(result.callback).toMatchObject({
          ok: false,
        });
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    const result = testCase.mock(testCase.inputs);
    testCase.assert(result);
  });
});
