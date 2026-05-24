import * as t from 'io-ts';

import { DiscordControlActionCodec } from '../discord-control-plane/codec.js';

/** Codec for discord application command type. */
export const DiscordApplicationCommandTypeCodec = t.literal(1);

/** Codec for discord command option type (string). */
export const DiscordCommandOptionTypeCodec = t.literal(3);

/** Codec for a fixed command option choice. */
export const DiscordCommandOptionChoiceCodec = t.type({
  name: t.string,
  value: t.string,
});

/** Codec for a slash-command string option. */
export const DiscordCommandOptionCodec = t.type({
  type: DiscordCommandOptionTypeCodec,
  name: t.string,
  description: t.string,
  required: t.boolean,
  choices: t.readonlyArray(DiscordCommandOptionChoiceCodec),
});

/** Codec for discord command contract. */
export const DiscordCommandContractCodec = t.intersection([
  t.type({
    name: t.string,
    description: t.string,
    type: DiscordApplicationCommandTypeCodec,
    action: DiscordControlActionCodec,
    privileged: t.boolean,
  }),
  t.partial({
    options: t.readonlyArray(DiscordCommandOptionCodec),
  }),
]);

/** Codec for discord command contract registry. */
export const DiscordCommandContractRegistryCodec = t.type({
  version: t.literal(1),
  contracts: t.readonlyArray(DiscordCommandContractCodec),
});

/** Discord application command type supported by DevPlat. */
export type DiscordApplicationCommandType = t.TypeOf<
  typeof DiscordApplicationCommandTypeCodec
>;

/** Discord command option type supported by DevPlat. */
export type DiscordCommandOptionType = t.TypeOf<
  typeof DiscordCommandOptionTypeCodec
>;

/** Static string choice for a Discord command option. */
export type DiscordCommandOptionChoice = t.TypeOf<
  typeof DiscordCommandOptionChoiceCodec
>;

/** Slash-command option contract supported by DevPlat. */
export type DiscordCommandOption = t.TypeOf<typeof DiscordCommandOptionCodec>;

/** Command contract that maps a Discord command to a DevPlat action. */
export type DiscordCommandContract = t.TypeOf<
  typeof DiscordCommandContractCodec
>;

/** Versioned registry of Discord operator command contracts. */
export type DiscordCommandContractRegistry = t.TypeOf<
  typeof DiscordCommandContractRegistryCodec
>;
