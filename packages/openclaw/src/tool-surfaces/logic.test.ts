import { describe, expect, it } from 'vitest';

import { TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN } from './constants.js';
import {
  createOpenClawOperationalToolPayload,
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
      name: 'adds lifecycle evidence to artifact payloads',
      inputs: {
        payload: {
          id: 'research-artifact-1',
          artifactType: 'research-brief',
          status: 'complete',
          nextAction: 'create-spec',
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toMatchObject({
          operationalResult: {
            status: 'complete',
            artifactId: 'research-artifact-1',
            nextAction: 'create-spec',
          },
        });
      },
    },
    {
      name: 'adds persisted storage evidence to record payloads',
      inputs: {
        payload: {
          status: 'ok',
          scope: 'state',
          key: 'task-1',
          record: {
            key: 'task-1',
          },
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toMatchObject({
          operationalResult: {
            status: 'ok',
            persistedRecordKey: 'task-1',
          },
        });
      },
    },
    {
      name: 'adds policy and telemetry evidence to action payloads',
      inputs: {
        payload: {
          allowed: false,
          policyDecisionId: 'policy-1',
          telemetryEventId: 'telemetry-1',
          nextAction: 'request-approval',
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toMatchObject({
          operationalResult: {
            status: 'blocked',
            policyDecisionId: 'policy-1',
            telemetryEventId: 'telemetry-1',
            nextAction: 'request-approval',
          },
        });
      },
    },
    {
      name: 'maps passed gate evidence to succeeded status',
      inputs: {
        payload: {
          passed: true,
          classification: {
            nextAction: 'continue',
          },
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toMatchObject({
          operationalResult: {
            status: 'succeeded',
            nextAction: 'continue',
          },
        });
      },
    },
    {
      name: 'maps failed gate evidence to failed status',
      inputs: {
        payload: {
          passed: false,
          classification: {
            nextAction: 'create-remediation-plan',
          },
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toMatchObject({
          operationalResult: {
            status: 'failed',
            nextAction: 'create-remediation-plan',
          },
        });
      },
    },
    {
      name: 'maps success evidence to succeeded status',
      inputs: {
        payload: {
          success: true,
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toMatchObject({
          operationalResult: {
            status: 'succeeded',
          },
        });
      },
    },
    {
      name: 'maps unsuccessful evidence to failed status',
      inputs: {
        payload: {
          success: false,
        },
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toMatchObject({
          operationalResult: {
            status: 'failed',
          },
        });
      },
    },
    {
      name: 'keeps primitive payloads unchanged',
      inputs: {
        payload: 'plain text',
      },
      mock: ({ payload }: { payload: unknown }) =>
        createOpenClawOperationalToolPayload(payload),
      assert: (payload: unknown) => {
        expect(payload).toBe('plain text');
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
