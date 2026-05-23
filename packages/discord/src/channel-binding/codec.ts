import * as t from 'io-ts';

import {
  DEVPLAT_ACTION_SPEC,
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

/** Codec for discord binding kind. */
export const DiscordBindingKindCodec = t.union([
  t.literal(DEVPLAT_ACTION_SPEC),
  t.literal('implementation'),
  t.literal('pull-request'),
  t.literal('audit'),
]);

/** Codec for discord channel binding. */
export const DiscordChannelBindingCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  guildId: t.string,
  channelId: t.string,
  kind: DiscordBindingKindCodec,
  threadBindingMode: t.literal('inherit-parent'),
});

/** Codec for discord thread binding result. */
export const DiscordThreadBindingResultCodec = t.type({
  binding: DiscordChannelBindingCodec,
  threadId: t.string,
  parentChannelId: t.string,
  routingKey: t.string,
  inherited: t.literal(true),
  persistedKey: t.string,
});

/** Discord channel role used by DevPlat routing. */
export type DiscordBindingKind = t.TypeOf<typeof DiscordBindingKindCodec>;

/** Persisted Discord channel binding for a DevPlat workspace. */
export type DiscordChannelBinding = t.TypeOf<typeof DiscordChannelBindingCodec>;

/** Result produced when a thread inherits a channel binding. */
export type DiscordThreadBindingResult = t.TypeOf<
  typeof DiscordThreadBindingResultCodec
>;
