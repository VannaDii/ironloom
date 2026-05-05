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

/** Codec for discord gateway dispatch event. */
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

/** Codec for discord gateway interaction create event. */
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

/** Codec for discord gateway hello event. */
export const DiscordGatewayHelloEventCodec = t.type({
  op: t.literal(DISCORD_GATEWAY_HELLO_OPCODE),
  d: t.type({
    /**
     * Discord Gateway wire key; internally consumed as the heartbeat interval.
     */
    heartbeat_interval: t.number,
  }),
});

/** Codec for discord gateway heartbeat ack event. */
export const DiscordGatewayHeartbeatAckEventCodec = t.type({
  op: t.literal(DISCORD_GATEWAY_HEARTBEAT_ACK_OPCODE),
});

/** Codec for discord gateway identify payload. */
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

/** Codec for discord gateway heartbeat payload. */
export const DiscordGatewayHeartbeatPayloadCodec = t.type({
  op: t.literal(DISCORD_GATEWAY_HEARTBEAT_OPCODE),
  d: t.union([t.number, t.null]),
});

/** Codec for discord interaction gateway ignored result. */
export const DiscordInteractionGatewayIgnoredResultCodec = t.type({
  status: t.literal('ignored'),
  eventName: t.string,
});

/** Codec for discord interaction gateway rejected result. */
export const DiscordInteractionGatewayRejectedResultCodec = t.type({
  status: t.literal('rejected'),
  eventName: t.string,
  reason: t.string,
});

/** Codec for discord interaction gateway handled result. */
export const DiscordInteractionGatewayHandledResultCodec = t.type({
  status: t.literal('handled'),
  interactionId: t.string,
  threadId: t.string,
  controlResult: DiscordControlResultCodec,
});

/** Codec for discord interaction gateway result. */
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
