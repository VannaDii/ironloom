import * as t from 'io-ts';

import {
  DiscordControlResultCodec,
  DiscordInteractionCallbackCodec,
} from '../discord-control-plane/codec.js';
import {
  DISCORD_GATEWAY_DISPATCH_OPCODE,
  DISCORD_GATEWAY_HEARTBEAT_ACK_OPCODE,
  DISCORD_GATEWAY_HEARTBEAT_OPCODE,
  DISCORD_GATEWAY_HELLO_OPCODE,
  DISCORD_GATEWAY_IDENTIFY_OPCODE,
  DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
} from './constants.js';

export const DiscordGatewayDispatchEventCodec = t.intersection([
  t.type({
    op: t.literal(DISCORD_GATEWAY_DISPATCH_OPCODE),
    t: t.string,
    d: t.unknown,
  }),
  t.partial({
    s: t.number,
  }),
]);

export const DiscordGatewayInteractionCreateEventCodec = t.intersection([
  t.type({
    op: t.literal(DISCORD_GATEWAY_DISPATCH_OPCODE),
    t: t.literal(DISCORD_GATEWAY_INTERACTION_CREATE_EVENT),
    d: DiscordInteractionCallbackCodec,
  }),
  t.partial({
    s: t.number,
  }),
]);

export const DiscordGatewayHelloEventCodec = t.type({
  op: t.literal(DISCORD_GATEWAY_HELLO_OPCODE),
  d: t.type({
    /**
     * Discord Gateway wire key; internally consumed as the heartbeat interval.
     */
    heartbeat_interval: t.number,
  }),
});

export const DiscordGatewayHeartbeatAckEventCodec = t.type({
  op: t.literal(DISCORD_GATEWAY_HEARTBEAT_ACK_OPCODE),
});

export const DiscordGatewayIdentifyPayloadCodec = t.type({
  op: t.literal(DISCORD_GATEWAY_IDENTIFY_OPCODE),
  d: t.type({
    token: t.string,
    intents: t.number,
    properties: t.type({
      $os: t.string,
      $browser: t.string,
      $device: t.string,
    }),
  }),
});

export const DiscordGatewayHeartbeatPayloadCodec = t.type({
  op: t.literal(DISCORD_GATEWAY_HEARTBEAT_OPCODE),
  d: t.union([t.number, t.null]),
});

export const DiscordInteractionGatewayIgnoredResultCodec = t.type({
  status: t.literal('ignored'),
  eventName: t.string,
});

export const DiscordInteractionGatewayRejectedResultCodec = t.type({
  status: t.literal('rejected'),
  eventName: t.string,
  reason: t.string,
});

export const DiscordInteractionGatewayHandledResultCodec = t.type({
  status: t.literal('handled'),
  interactionId: t.string,
  threadId: t.string,
  controlResult: DiscordControlResultCodec,
});

export const DiscordInteractionGatewayResultCodec = t.union([
  DiscordInteractionGatewayIgnoredResultCodec,
  DiscordInteractionGatewayRejectedResultCodec,
  DiscordInteractionGatewayHandledResultCodec,
]);

/** Discord Gateway dispatch event envelope. */
export type DiscordGatewayDispatchEvent = t.TypeOf<
  typeof DiscordGatewayDispatchEventCodec
>;

/** Discord Gateway INTERACTION_CREATE dispatch event. */
export type DiscordGatewayInteractionCreateEvent = t.TypeOf<
  typeof DiscordGatewayInteractionCreateEventCodec
>;

/** Discord Gateway Hello event. */
export type DiscordGatewayHelloEvent = t.TypeOf<
  typeof DiscordGatewayHelloEventCodec
>;

/** Discord Gateway Identify payload. */
export type DiscordGatewayIdentifyPayload = t.TypeOf<
  typeof DiscordGatewayIdentifyPayloadCodec
>;

/** Discord Gateway Heartbeat payload. */
export type DiscordGatewayHeartbeatPayload = t.TypeOf<
  typeof DiscordGatewayHeartbeatPayloadCodec
>;

/** Result of processing a Discord Gateway interaction event. */
export type DiscordInteractionGatewayResult = t.TypeOf<
  typeof DiscordInteractionGatewayResultCodec
>;
