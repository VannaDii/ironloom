import * as t from 'io-ts';

import { DiscordControlActionCodec } from '../discord-control-plane/codec.js';

export const DiscordApplicationCommandTypeCodec = t.literal(1);

export const DiscordCommandContractCodec = t.type({
  name: t.string,
  description: t.string,
  type: DiscordApplicationCommandTypeCodec,
  action: DiscordControlActionCodec,
  privileged: t.boolean,
});

export const DiscordCommandContractRegistryCodec = t.type({
  version: t.literal(1),
  contracts: t.readonlyArray(DiscordCommandContractCodec),
});
