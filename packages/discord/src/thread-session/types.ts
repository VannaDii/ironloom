import type * as t from 'io-ts';

import type {
  DiscordImplementationThreadSessionCodec,
  DiscordPullRequestThreadSessionCodec,
  DiscordSpecThreadSessionCodec,
  DiscordThreadKindCodec,
  DiscordThreadSessionCodec,
  DiscordThreadSessionInputCodec,
  DiscordThreadSessionResultCodec,
} from './codec.js';

export type DiscordThreadKind = t.TypeOf<typeof DiscordThreadKindCodec>;

export type DiscordThreadSessionInput = t.TypeOf<
  typeof DiscordThreadSessionInputCodec
>;

export type DiscordSpecThreadSession = t.TypeOf<
  typeof DiscordSpecThreadSessionCodec
>;

export type DiscordImplementationThreadSession = t.TypeOf<
  typeof DiscordImplementationThreadSessionCodec
>;

export type DiscordPullRequestThreadSession = t.TypeOf<
  typeof DiscordPullRequestThreadSessionCodec
>;

export type DiscordThreadSession = t.TypeOf<typeof DiscordThreadSessionCodec>;

export type DiscordThreadSessionResult = t.TypeOf<
  typeof DiscordThreadSessionResultCodec
>;
