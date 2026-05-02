import { describe, expect, it } from 'vitest';

import { TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN } from './constants.js';
import {
  createToolPayloadText,
  formatToolPayloadText,
  sanitizeToolPayloadForDisplay,
} from './logic.js';

describe('tool surface logic', () => {
  const cases = [
    {
      name: 'serializes tool payloads as formatted JSON text',
      inputs: {
        payload: { ok: true },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createToolPayloadText(payload),
      assert: (text: string) => {
        expect(text).toContain('"ok": true');
      },
    },
    {
      name: 'formats pre-sanitized payloads without re-sanitizing',
      inputs: {
        payload: {
          discord: {
            botToken: '[redacted]',
          },
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        formatToolPayloadText(payload),
      assert: (text: string) => {
        expect(text).toContain('"botToken": "[redacted]"');
      },
    },
    {
      name: 'redacts sensitive fields recursively',
      inputs: {
        payload: {
          discord: {
            botToken: 'token-123',
            publicKey: 'public-key-123',
            nested: {
              refreshToken: 'refresh-token-123',
            },
          },
          projectKey: 'vannadii_devplat',
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        sanitizeToolPayloadForDisplay(payload),
      assert: (sanitizedPayload: unknown) => {
        expect(sanitizedPayload).toEqual({
          discord: {
            botToken: '[redacted]',
            publicKey: '[redacted]',
            nested: {
              refreshToken: '[redacted]',
            },
          },
          projectKey: 'vannadii_devplat',
        });
      },
    },
    {
      name: 'keeps the sensitive-key normalization pattern explicit and tested',
      inputs: {
        matchingKeys: ['bot-token', 'api_key', 'public key'],
        nonMatchingKeys: ['botToken', 'apiKey', 'publicKey'],
      },
      mock: (inputs: { matchingKeys: string[]; nonMatchingKeys: string[] }) =>
        inputs,
      assert: (inputs: {
        matchingKeys: string[];
        nonMatchingKeys: string[];
      }) => {
        for (const key of inputs.matchingKeys) {
          expect(TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN.test(key)).toBe(
            true,
          );
          TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN.lastIndex = 0;
        }

        for (const key of inputs.nonMatchingKeys) {
          expect(TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN.test(key)).toBe(
            false,
          );
          TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN.lastIndex = 0;
        }
      },
    },
  ];

  it.each(cases)('$name', ({ inputs, mock, assert }) => {
    assert(mock(inputs));
  });
});
