import * as t from 'io-ts';

import { DiscordControlActionCodec } from '../discord-control-plane/codec.js';

/** Codec for discord application command type. */
export const DiscordApplicationCommandTypeCodec = t.literal(1);

/** Codec for discord command contract. */
export const DiscordCommandContractCodec = t.type({
  name: t.string,
  description: t.string,
  type: DiscordApplicationCommandTypeCodec,
  action: DiscordControlActionCodec,
  privileged: t.boolean,
});

/** Codec for discord command contract registry. */
export const DiscordCommandContractRegistryCodec = t.type({
  version: t.literal(1),
  contracts: t.readonlyArray(DiscordCommandContractCodec),
});

/** Discord application command type supported by DevPlat. */
export type DiscordApplicationCommandType = t.TypeOf<
  typeof DiscordApplicationCommandTypeCodec
>;

/** Command contract that maps a Discord command to a DevPlat action. */
export type DiscordCommandContract = t.TypeOf<
  typeof DiscordCommandContractCodec
>;

/** Versioned registry of Discord operator command contracts. */
export type DiscordCommandContractRegistry = t.TypeOf<
  typeof DiscordCommandContractRegistryCodec
>;
