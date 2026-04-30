import type * as t from 'io-ts';

import type {
  DiscordBindingKindCodec,
  DiscordChannelBindingCodec,
  DiscordThreadBindingResultCodec,
} from './codec.js';

export type DiscordBindingKind = t.TypeOf<typeof DiscordBindingKindCodec>;

export type DiscordChannelBinding = t.TypeOf<typeof DiscordChannelBindingCodec>;

export type DiscordThreadBindingResult = t.TypeOf<
  typeof DiscordThreadBindingResultCodec
>;
