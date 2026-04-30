import type * as t from 'io-ts';

import type {
  DiscordControlActionCodec,
  DiscordControlRequestCodec,
  DiscordControlResultCodec,
  DiscordInteractionRouteCodec,
  DiscordInteractionRouteFailureCodec,
  DiscordInteractionRouteSuccessCodec,
  DiscordOperatorInteractionCodec,
  DiscordResponseReceiptCodec,
} from './codec.js';

export type DiscordControlAction = t.TypeOf<typeof DiscordControlActionCodec>;

export type DiscordControlRequest = t.TypeOf<typeof DiscordControlRequestCodec>;

export type DiscordControlResult = t.TypeOf<typeof DiscordControlResultCodec>;

export type DiscordOperatorInteraction = t.TypeOf<
  typeof DiscordOperatorInteractionCodec
>;

export type DiscordInteractionRouteSuccess = t.TypeOf<
  typeof DiscordInteractionRouteSuccessCodec
>;

export type DiscordInteractionRouteFailure = t.TypeOf<
  typeof DiscordInteractionRouteFailureCodec
>;

export type DiscordInteractionRoute = t.TypeOf<
  typeof DiscordInteractionRouteCodec
>;

export type DiscordResponseReceipt = t.TypeOf<
  typeof DiscordResponseReceiptCodec
>;
