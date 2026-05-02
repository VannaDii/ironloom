import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const DiscordApprovalActionCodec = t.union([
  t.literal('approve'),
  t.literal('retry'),
  t.literal('merge'),
  t.literal('escalate'),
]);

export const DiscordApprovalRequestCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  actorId: t.string,
  channelId: t.string,
  threadId: t.string,
  action: DiscordApprovalActionCodec,
  artifactId: t.string,
  privileged: t.boolean,
});

export const DiscordApprovalResultCodec = t.type({
  request: DiscordApprovalRequestCodec,
  policyDecisionId: t.string,
  allowed: t.boolean,
  artifactId: t.string,
  persistedKey: t.string,
});

/** Operator approval action requested from Discord. */
export type DiscordApprovalAction = t.TypeOf<typeof DiscordApprovalActionCodec>;

/** Thread-aware approval request received from Discord. */
export type DiscordApprovalRequest = t.TypeOf<
  typeof DiscordApprovalRequestCodec
>;

/** Auditable result of a Discord approval request. */
export type DiscordApprovalResult = t.TypeOf<typeof DiscordApprovalResultCodec>;
