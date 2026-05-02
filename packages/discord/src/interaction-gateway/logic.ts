import { decodeWithCodec } from '@vannadii/devplat-core';

import { DiscordInteractionCallbackCodec } from '../discord-control-plane/codec.js';
import type { DiscordInteractionCallback } from '../discord-control-plane/codec.js';
import { DISCORD_GATEWAY_INTERACTION_CREATE_EVENT } from './constants.js';
import type { DiscordGatewayDispatchEvent } from './codec.js';

/**
 * Returns true when a Gateway dispatch carries a Discord interaction callback.
 */
export function isDiscordGatewayInteractionCreateEvent(
  input: DiscordGatewayDispatchEvent,
): boolean {
  return input.t === DISCORD_GATEWAY_INTERACTION_CREATE_EVENT;
}

/**
 * Decodes a Gateway dispatch payload as a Discord interaction callback.
 */
export function decodeDiscordGatewayInteractionCallback(
  input: DiscordGatewayDispatchEvent,
):
  | {
      readonly ok: true;
      readonly callback: DiscordInteractionCallback;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    } {
  const decoded = decodeWithCodec(DiscordInteractionCallbackCodec, input.d);
  if (!decoded.ok) {
    return {
      ok: false,
      reason: `Discord Gateway event did not include a supported interaction callback: ${decoded.error}`,
    };
  }

  return {
    ok: true,
    callback: decoded.value,
  };
}
