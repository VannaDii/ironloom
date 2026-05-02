import {
  REDACTED_TOOL_PAYLOAD_VALUE,
  TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN,
} from './constants.js';

/**
 * Returns true when a payload key name conventionally carries secret material.
 */
function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN, '')
    .toLowerCase();

  return (
    normalized === 'publickey' ||
    normalized === 'privatekey' ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password') ||
    normalized.endsWith('apikey')
  );
}

/**
 * Recursively replaces sensitive payload values with a display-safe marker.
 */
export function sanitizeToolPayloadForDisplay(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeToolPayloadForDisplay(item));
  }

  if (typeof payload !== 'object' || payload === null) {
    return payload;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      isSensitiveKey(key)
        ? REDACTED_TOOL_PAYLOAD_VALUE
        : sanitizeToolPayloadForDisplay(value),
    ]),
  );
}

/**
 * Serializes a sanitized tool payload for text result display.
 */
export function formatToolPayloadText(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Sanitizes and serializes a tool payload for OpenClaw text responses.
 */
export function createToolPayloadText(payload: unknown): string {
  return formatToolPayloadText(sanitizeToolPayloadForDisplay(payload));
}
