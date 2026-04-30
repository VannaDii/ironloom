import * as t from 'io-ts';

import { LifecycleStatusCodec, type Exact } from '@vannadii/devplat-core';

import type {
  DiscordControlRequest,
  DiscordOperatorInteraction,
} from './types.js';

export const DiscordControlActionCodec = t.union([
  t.literal('run-this'),
  t.literal('claim-this'),
  t.literal('approve-this'),
  t.literal('block-this'),
  t.literal('complete-this'),
  t.literal('pause-this'),
  t.literal('resume-this'),
  t.literal('rebase-all-dependents'),
  t.literal('retry-gates'),
  t.literal('merge-now'),
  t.literal('show-status'),
  t.literal('show-last-artifact'),
  t.literal('explain-failure'),
  t.literal('sync-worktree'),
  t.literal('release-worktree'),
  t.literal('update-spec'),
]);

export const DiscordControlRequestCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  actorId: t.string,
  threadId: t.string,
  channelId: t.string,
  action: DiscordControlActionCodec,
  privileged: t.boolean,
});

export const DiscordOperatorInteractionCodec = t.intersection([
  t.type({
    id: t.string,
    token: t.string,
    actorId: t.string,
    channelId: t.string,
    updatedAt: t.string,
  }),
  t.partial({
    commandName: t.string,
    customId: t.string,
    summary: t.string,
    threadId: t.string,
    boundThreadId: t.string,
    privileged: t.boolean,
  }),
]);

export type _DiscordControlRequestExact = Exact<
  DiscordControlRequest,
  t.TypeOf<typeof DiscordControlRequestCodec>
>;

export type _DiscordOperatorInteractionExact = Exact<
  DiscordOperatorInteraction,
  t.TypeOf<typeof DiscordOperatorInteractionCodec>
>;
