import type * as t from 'io-ts';

import type {
  DiscordInteractionWebhookParseResultCodec,
  DiscordInteractionWebhookRequestCodec,
  DiscordInteractionWebhookResponseBodyCodec,
  DiscordInteractionWebhookResultCodec,
} from './codec.js';

export type DiscordInteractionWebhookRequest = t.TypeOf<
  typeof DiscordInteractionWebhookRequestCodec
>;

export type DiscordInteractionWebhookResponseBody = t.TypeOf<
  typeof DiscordInteractionWebhookResponseBodyCodec
>;

export type DiscordInteractionWebhookParseResult = t.TypeOf<
  typeof DiscordInteractionWebhookParseResultCodec
>;

export type DiscordInteractionWebhookResult = t.TypeOf<
  typeof DiscordInteractionWebhookResultCodec
>;
