import { createPublicKey, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { DiscordInteractionCallbackCodec } from '../discord-control-plane/codec.js';
import type {
  DiscordInteractionWebhookParseResult,
  DiscordInteractionWebhookRequest,
} from './codec.js';
import {
  DISCORD_ED25519_SPKI_PREFIX_HEX,
  DISCORD_HEX_SIGNATURE_FIELD_PATTERN,
} from './constants.js';

/**
 * DER SubjectPublicKeyInfo prefix bytes for Discord Ed25519 public keys.
 */
const discordEd25519SpkiPrefix = Buffer.from(
  DISCORD_ED25519_SPKI_PREFIX_HEX,
  'hex',
);

/**
 * Decodes fixed-width hexadecimal Discord signature material.
 */
function decodeFixedHex(
  value: string,
  expectedByteLength: number,
): Buffer | undefined {
  const normalized = value.trim();
  if (
    normalized.length !== expectedByteLength * 2 ||
    !DISCORD_HEX_SIGNATURE_FIELD_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  return Buffer.from(normalized, 'hex');
}

/**
 * Creates a Node public key from Discord's raw Ed25519 public-key string.
 */
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

/**
 * Parses the raw interaction request body.
 */
function parseWebhookJson(body: string): unknown {
  return JSON.parse(body);
}

/**
 * Returns true when the parsed payload is Discord's interaction ping probe.
 */
function isDiscordPingPayload(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 1
  );
}

/**
 * Verifies a Discord interaction request using the Ed25519 signature headers.
 */
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

/**
 * Parses a Discord interaction webhook body into ping or command callback form.
 */
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
