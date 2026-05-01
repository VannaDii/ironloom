import type * as t from 'io-ts';

import type {
  DiscordApplicationCommandTypeCodec,
  DiscordCommandContractCodec,
  DiscordCommandContractRegistryCodec,
} from './codec.js';

export type DiscordApplicationCommandType = t.TypeOf<
  typeof DiscordApplicationCommandTypeCodec
>;

export type DiscordCommandContract = t.TypeOf<
  typeof DiscordCommandContractCodec
>;

export type DiscordCommandContractRegistry = t.TypeOf<
  typeof DiscordCommandContractRegistryCodec
>;
