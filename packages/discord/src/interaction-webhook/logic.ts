import { createPublicKey, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { DiscordInteractionCallbackCodec } from '../discord-control-plane/codec.js';
import type {
  DiscordInteractionWebhookParseResult,
  DiscordInteractionWebhookRequest,
} from './types.js';

const discordEd25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const hexPattern = /^[0-9a-f]+$/iu;

function decodeFixedHex(
  value: string,
  expectedByteLength: number,
): Buffer | undefined {
  const normalized = value.trim();
  if (
    normalized.length !== expectedByteLength * 2 ||
    !hexPattern.test(normalized)
  ) {
    return undefined;
  }

  return Buffer.from(normalized, 'hex');
}

function createDiscordPublicKey(publicKey: string): KeyObject | undefined {
  const publicKeyBytes = decodeFixedHex(publicKey, 32);
  if (publicKeyBytes === undefined) {
    return undefined;
  }

  return createPublicKey({
    key: Buffer.concat([discordEd25519SpkiPrefix, publicKeyBytes]),
    format: 'der',
    type: 'spki',
  });
}

function parseWebhookJson(body: string): unknown {
  return JSON.parse(body);
}

function isDiscordPingPayload(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 1
  );
}

export function verifyDiscordInteractionSignature(
  input: DiscordInteractionWebhookRequest,
): boolean {
  const signature = decodeFixedHex(input.headers['x-signature-ed25519'], 64);
  const publicKey = createDiscordPublicKey(input.publicKey);
  if (signature === undefined || publicKey === undefined) {
    return false;
  }

  return verify(
    null,
    Buffer.from(`${input.headers['x-signature-timestamp']}${input.body}`),
    publicKey,
    signature,
  );
}

export function parseDiscordInteractionWebhookBody(
  body: string,
): DiscordInteractionWebhookParseResult {
  let parsed: unknown;
  try {
    parsed = parseWebhookJson(body);
  } catch {
    return {
      ok: false,
      reason: 'Discord interaction webhook body must be valid JSON.',
    };
  }

  if (isDiscordPingPayload(parsed)) {
    return {
      ok: true,
      kind: 'ping',
    };
  }

  const decoded = decodeWithCodec(DiscordInteractionCallbackCodec, parsed);
  if (!decoded.ok) {
    return {
      ok: false,
      reason: `Discord interaction webhook body did not match a supported callback payload: ${decoded.error}`,
    };
  }

  return {
    ok: true,
    kind: 'callback',
    callback: decoded.value,
  };
}
