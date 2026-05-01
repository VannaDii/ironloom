import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

import {
  DiscordThreadKindCodec,
  DiscordThreadSessionCodec,
  PositivePullRequestNumberCodec,
} from '../thread-session/codec.js';

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

export const DiscordWorkItemBindingCodec = t.intersection([
  t.type({
    threadKind: DiscordThreadKindCodec,
    threadId: t.string,
    artifactId: t.string,
  }),
  t.partial({
    specId: t.string,
    sliceId: t.string,
    pullRequestNumber: PositivePullRequestNumberCodec,
  }),
]);

export const DiscordControlRequestCodec = t.intersection([
  t.type({
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
  }),
  t.partial({
    workItem: DiscordWorkItemBindingCodec,
  }),
]);

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
    boundSession: DiscordThreadSessionCodec,
    privileged: t.boolean,
  }),
]);

export const DiscordInteractionCallbackUserCodec = t.type({
  id: t.string,
});

export const DiscordInteractionCallbackMemberCodec = t.type({
  user: DiscordInteractionCallbackUserCodec,
});

export const DiscordInteractionCallbackDataCodec = t.partial({
  name: t.string,
  custom_id: t.string,
});

export const DiscordInteractionCallbackCodec = t.intersection([
  t.type({
    id: t.string,
    token: t.string,
    channel_id: t.string,
  }),
  t.partial({
    data: DiscordInteractionCallbackDataCodec,
    member: DiscordInteractionCallbackMemberCodec,
    user: DiscordInteractionCallbackUserCodec,
  }),
]);

export const DiscordInteractionCallbackOptionsCodec = t.partial({
  threadId: t.string,
  boundThreadId: t.string,
  boundSession: DiscordThreadSessionCodec,
  summary: t.string,
  privileged: t.boolean,
  updatedAt: t.string,
});

export const DiscordResponseReceiptCodec = t.type({
  endpoint: t.string,
  statusCode: t.number,
  responseBody: t.unknown,
});

export const DiscordControlResultCodec = t.intersection([
  t.type({
    request: DiscordControlRequestCodec,
    policyDecisionId: t.string,
    allowed: t.boolean,
    persistedKey: t.string,
    failedClosed: t.boolean,
  }),
  t.partial({
    workItem: DiscordWorkItemBindingCodec,
    responseReceipt: DiscordResponseReceiptCodec,
    threadReceipt: DiscordResponseReceiptCodec,
  }),
]);

export const DiscordInteractionRouteSuccessCodec = t.type({
  ok: t.literal(true),
  request: DiscordControlRequestCodec,
});

export const DiscordInteractionRouteFailureCodec = t.type({
  ok: t.literal(false),
  interactionId: t.string,
  reason: t.string,
});

export const DiscordInteractionRouteCodec = t.union([
  DiscordInteractionRouteSuccessCodec,
  DiscordInteractionRouteFailureCodec,
]);
