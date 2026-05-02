import { generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DISCORD_HEX_SIGNATURE_FIELD_PATTERN } from './constants.js';
import {
  parseDiscordInteractionWebhookBody,
  verifyDiscordInteractionSignature,
} from './logic.js';

/**
 * Creates a signed Discord interaction request fixture.
 */
function createSignedRequest(body: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const timestamp = '2026-05-01T00:00:00.000Z';
  const publicKeyDer = publicKey.export({
    format: 'der',
    type: 'spki',
  });
  const publicKeyHex = publicKeyDer
    .subarray(publicKeyDer.length - 32)
    .toString('hex');
  const signature = sign(
    null,
    Buffer.from(`${timestamp}${body}`),
    privateKey,
  ).toString('hex');

  return {
    body,
    publicKey: publicKeyHex,
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
  };
}

describe('discord interaction webhook logic', () => {
  const cases = [
    {
      name: 'verifies Discord Ed25519 interaction signatures',
      inputs: {
        request: createSignedRequest(
          JSON.stringify({
            id: 'interaction-1',
            token: 'token-1',
            channel_id: 'thread-1',
            data: {
              name: 'retry-gates',
            },
            member: {
              user: {
                id: 'operator-1',
              },
            },
          }),
        ),
      },
      mock: async (inputs: {
        request: ReturnType<typeof createSignedRequest>;
      }) => verifyDiscordInteractionSignature(inputs.request),
      assert: (verified: boolean) => {
        expect(verified).toBe(true);
      },
    },
    {
      name: 'rejects tampered Discord interaction payloads',
      inputs: {
        request: {
          ...createSignedRequest(
            JSON.stringify({
              id: 'interaction-1',
              token: 'token-1',
              channel_id: 'thread-1',
            }),
          ),
          body: JSON.stringify({
            id: 'interaction-2',
            token: 'token-1',
            channel_id: 'thread-1',
          }),
        },
      },
      mock: async (inputs: {
        request: ReturnType<typeof createSignedRequest>;
      }) => verifyDiscordInteractionSignature(inputs.request),
      assert: (verified: boolean) => {
        expect(verified).toBe(false);
      },
    },
    {
      name: 'rejects malformed signature and public key hex',
      inputs: {
        request: {
          ...createSignedRequest(
            JSON.stringify({
              id: 'interaction-hex',
              token: 'token-hex',
              channel_id: 'thread-hex',
            }),
          ),
          publicKey: 'not-a-public-key',
          headers: {
            'x-signature-ed25519': 'not-a-signature',
            'x-signature-timestamp': '2026-05-01T00:00:00.000Z',
          },
        },
      },
      mock: async (inputs: {
        request: ReturnType<typeof createSignedRequest>;
      }) => verifyDiscordInteractionSignature(inputs.request),
      assert: (verified: boolean) => {
        expect(verified).toBe(false);
      },
    },
    {
      name: 'parses Discord ping payloads',
      inputs: {
        body: JSON.stringify({
          type: 1,
        }),
      },
      mock: async (inputs: { body: string }) =>
        parseDiscordInteractionWebhookBody(inputs.body),
      assert: (
        parsed: ReturnType<typeof parseDiscordInteractionWebhookBody>,
      ) => {
        expect(parsed.ok).toBe(true);
        expect(parsed.kind).toBe('ping');
      },
    },
    {
      name: 'parses callback-shaped slash commands',
      inputs: {
        body: JSON.stringify({
          id: 'interaction-3',
          token: 'token-3',
          channel_id: 'thread-3',
          data: {
            name: 'show-status',
          },
          user: {
            id: 'operator-3',
          },
        }),
      },
      mock: async (inputs: { body: string }) =>
        parseDiscordInteractionWebhookBody(inputs.body),
      assert: (
        parsed: ReturnType<typeof parseDiscordInteractionWebhookBody>,
      ) => {
        expect(parsed.ok).toBe(true);
        expect(parsed.kind).toBe('callback');
      },
    },
    {
      name: 'fails closed for malformed JSON',
      inputs: {
        body: '{',
      },
      mock: async (inputs: { body: string }) =>
        parseDiscordInteractionWebhookBody(inputs.body),
      assert: (
        parsed: ReturnType<typeof parseDiscordInteractionWebhookBody>,
      ) => {
        expect(parsed.ok).toBe(false);
        expect(parsed.reason).toContain('valid JSON');
      },
    },
    {
      name: 'fails closed for unsupported JSON payloads',
      inputs: {
        body: JSON.stringify({
          type: 2,
        }),
      },
      mock: async (inputs: { body: string }) =>
        parseDiscordInteractionWebhookBody(inputs.body),
      assert: (
        parsed: ReturnType<typeof parseDiscordInteractionWebhookBody>,
      ) => {
        expect(parsed.ok).toBe(false);
        expect(parsed.reason).toContain('supported callback payload');
      },
    },
    {
      name: 'keeps Discord hex field validation explicit and tested',
      inputs: {
        validHexValues: ['abcdef', 'ABCDEF', '1234567890abcdef'],
        invalidHexValues: ['', 'not-hex', 'abc123!', 'abc 123'],
      },
      mock: (inputs: {
        validHexValues: string[];
        invalidHexValues: string[];
      }) => inputs,
      assert: (inputs: {
        validHexValues: string[];
        invalidHexValues: string[];
      }) => {
        for (const value of inputs.validHexValues) {
          expect(DISCORD_HEX_SIGNATURE_FIELD_PATTERN.test(value)).toBe(true);
        }

        for (const value of inputs.invalidHexValues) {
          expect(DISCORD_HEX_SIGNATURE_FIELD_PATTERN.test(value)).toBe(false);
        }
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    testCase.assert(result);
  });
});
