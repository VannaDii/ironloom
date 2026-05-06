import * as t from 'io-ts';

import {
  DiscordInteractionCallbackCodec,
  DiscordMessagePayloadCodec,
} from '../discord-control-plane/codec.js';

/** Codec for discord interaction webhook headers. */
export const DiscordInteractionWebhookHeadersCodec = t.type({
  'x-signature-ed25519': t.string,
  'x-signature-timestamp': t.string,
});

/** Codec for discord interaction webhook request. */
export const DiscordInteractionWebhookRequestCodec = t.type({
  body: t.string,
  publicKey: t.string,
  headers: DiscordInteractionWebhookHeadersCodec,
});

/** Codec for discord interaction webhook pong response body. */
export const DiscordInteractionWebhookPongResponseBodyCodec = t.type({
  type: t.literal(1),
});

/** Codec for discord interaction webhook message response body. */
export const DiscordInteractionWebhookMessageResponseBodyCodec = t.type({
  type: t.literal(4),
  data: DiscordMessagePayloadCodec,
});

/** Codec for discord interaction webhook deferred response body. */
export const DiscordInteractionWebhookDeferredResponseBodyCodec = t.type({
  type: t.literal(5),
});

/** Codec for discord interaction webhook response body. */
export const DiscordInteractionWebhookResponseBodyCodec = t.union([
  DiscordInteractionWebhookPongResponseBodyCodec,
  DiscordInteractionWebhookMessageResponseBodyCodec,
  DiscordInteractionWebhookDeferredResponseBodyCodec,
]);

/** Codec for discord interaction webhook parse result. */
export const DiscordInteractionWebhookParseResultCodec = t.union([
  t.type({
    ok: t.literal(true),
    kind: t.literal('ping'),
  }),
  t.type({
    ok: t.literal(true),
    kind: t.literal('callback'),
    callback: DiscordInteractionCallbackCodec,
  }),
  t.type({
    ok: t.literal(false),
    reason: t.string,
  }),
]);

/** Codec for discord interaction webhook result. */
export const DiscordInteractionWebhookResultCodec = t.intersection([
  t.type({
    statusCode: t.number,
    verified: t.boolean,
    handled: t.boolean,
    responseBody: DiscordInteractionWebhookResponseBodyCodec,
  }),
  t.partial({
    persistedKey: t.string,
    policyDecisionId: t.string,
    threadId: t.string,
    error: t.string,
  }),
]);

/** Discord interaction webhook request before signature verification. */
export type DiscordInteractionWebhookRequest = t.TypeOf<
  typeof DiscordInteractionWebhookRequestCodec
>;

/** Discord interaction response body returned by the webhook. */
export type DiscordInteractionWebhookResponseBody = t.TypeOf<
  typeof DiscordInteractionWebhookResponseBodyCodec
>;

/** Parsed interaction payload result after signature validation. */
export type DiscordInteractionWebhookParseResult = t.TypeOf<
  typeof DiscordInteractionWebhookParseResultCodec
>;

/** Complete webhook handling result with audit routing metadata. */
export type DiscordInteractionWebhookResult = t.TypeOf<
  typeof DiscordInteractionWebhookResultCodec
>;
