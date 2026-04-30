import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const DiscordBindingKindCodec = t.union([
  t.literal('spec'),
  t.literal('implementation'),
  t.literal('pull-request'),
  t.literal('audit'),
]);

export const DiscordChannelBindingCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  guildId: t.string,
  channelId: t.string,
  kind: DiscordBindingKindCodec,
  threadBindingMode: t.literal('inherit-parent'),
});

export const DiscordThreadBindingResultCodec = t.type({
  binding: DiscordChannelBindingCodec,
  threadId: t.string,
  parentChannelId: t.string,
  routingKey: t.string,
  inherited: t.literal(true),
  persistedKey: t.string,
});
