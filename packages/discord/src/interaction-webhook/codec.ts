import * as t from 'io-ts';

import { DiscordInteractionCallbackCodec } from '../discord-control-plane/codec.js';

export const DiscordInteractionWebhookHeadersCodec = t.type({
  'x-signature-ed25519': t.string,
  'x-signature-timestamp': t.string,
});

export const DiscordInteractionWebhookRequestCodec = t.type({
  body: t.string,
  publicKey: t.string,
  headers: DiscordInteractionWebhookHeadersCodec,
});

export const DiscordInteractionWebhookPongResponseBodyCodec = t.type({
  type: t.literal(1),
});

export const DiscordInteractionWebhookMessageResponseBodyCodec = t.type({
  type: t.literal(4),
  data: t.type({
    content: t.string,
  }),
});

export const DiscordInteractionWebhookDeferredResponseBodyCodec = t.type({
  type: t.literal(5),
});

export const DiscordInteractionWebhookResponseBodyCodec = t.union([
  DiscordInteractionWebhookPongResponseBodyCodec,
  DiscordInteractionWebhookMessageResponseBodyCodec,
  DiscordInteractionWebhookDeferredResponseBodyCodec,
]);

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
