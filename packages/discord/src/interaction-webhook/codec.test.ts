import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  DiscordInteractionWebhookRequestCodec,
  DiscordInteractionWebhookResultCodec,
} from './codec.js';

describe('discord interaction webhook codecs', () => {
  const cases = [
    {
      name: 'decode signed webhook requests and handled results',
      inputs: {
        request: {
          body: '{"id":"interaction-1"}',
          publicKey: 'a'.repeat(64),
          headers: {
            'x-signature-ed25519': 'b'.repeat(128),
            'x-signature-timestamp': '2026-05-01T00:00:00.000Z',
          },
        },
        result: {
          statusCode: 200,
          verified: true,
          handled: true,
          responseBody: {
            type: 4,
            data: {
              content: 'Accepted retry-gates.',
            },
          },
          persistedKey: 'interaction-1',
          policyDecisionId: 'policy-1',
          threadId: 'thread-1',
        },
      },
      mock: async (inputs: { request: unknown; result: unknown }) => ({
        request: decodeWithCodec(
          DiscordInteractionWebhookRequestCodec,
          inputs.request,
        ),
        result: decodeWithCodec(
          DiscordInteractionWebhookResultCodec,
          inputs.result,
        ),
      }),
      assert: (decoded: {
        request: ReturnType<typeof decodeWithCodec>;
        result: ReturnType<typeof decodeWithCodec>;
      }) => {
        expect(decoded.request.ok).toBe(true);
        expect(decoded.result.ok).toBe(true);
      },
    },
    {
      name: 'reject malformed request headers and response bodies',
      inputs: {
        request: {
          body: '{"id":"interaction-1"}',
          publicKey: 'a'.repeat(64),
          headers: {
            'x-signature-ed25519': 123,
            'x-signature-timestamp': '2026-05-01T00:00:00.000Z',
          },
        },
        result: {
          statusCode: 200,
          verified: true,
          handled: true,
          responseBody: {
            type: 99,
          },
        },
      },
      mock: async (inputs: { request: unknown; result: unknown }) => ({
        request: decodeWithCodec(
          DiscordInteractionWebhookRequestCodec,
          inputs.request,
        ),
        result: decodeWithCodec(
          DiscordInteractionWebhookResultCodec,
          inputs.result,
        ),
      }),
      assert: (decoded: {
        request: ReturnType<typeof decodeWithCodec>;
        result: ReturnType<typeof decodeWithCodec>;
      }) => {
        expect(decoded.request.ok).toBe(false);
        expect(decoded.result.ok).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const decoded = await testCase.mock(testCase.inputs);
    testCase.assert(decoded);
  });
});
