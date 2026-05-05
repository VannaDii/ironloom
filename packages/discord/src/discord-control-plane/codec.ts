import * as t from 'io-ts';

import {
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

import {
  DiscordThreadKindCodec,
  DiscordThreadSessionCodec,
  PositivePullRequestNumberCodec,
} from '../thread-session/codec.js';

export const DiscordControlActionCodec = t.union([
  t.literal(DEVPLAT_ACTION_RUN_THIS),
  t.literal(DEVPLAT_ACTION_CLAIM_THIS),
  t.literal(DEVPLAT_ACTION_APPROVE_THIS),
  t.literal(DEVPLAT_ACTION_BLOCK_THIS),
  t.literal(DEVPLAT_ACTION_COMPLETE_THIS),
  t.literal(DEVPLAT_ACTION_PAUSE_THIS),
  t.literal(DEVPLAT_ACTION_RESUME_THIS),
  t.literal(DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS),
  t.literal(DEVPLAT_ACTION_RETRY_GATES),
  t.literal(DEVPLAT_ACTION_MERGE_NOW),
  t.literal(DEVPLAT_ACTION_SHOW_STATUS),
  t.literal(DEVPLAT_ACTION_SHOW_LAST_ARTIFACT),
  t.literal(DEVPLAT_ACTION_EXPLAIN_FAILURE),
  t.literal(DEVPLAT_ACTION_SYNC_WORKTREE),
  t.literal(DEVPLAT_ACTION_RELEASE_WORKTREE),
  t.literal(DEVPLAT_ACTION_UPDATE_SPEC),
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
    updatedAt: IsoTimestampCodec,
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
    updatedAt: IsoTimestampCodec,
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
  /**
   * Discord interaction callback wire key; internally normalized to `customId`.
   */
  custom_id: t.string,
});

export const DiscordInteractionCallbackCodec = t.intersection([
  t.type({
    id: t.string,
    token: t.string,
    /**
     * Discord interaction callback wire key; internally normalized to `channelId`.
     */
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
  updatedAt: IsoTimestampCodec,
});

export const DiscordResponseReceiptCodec = t.type({
  endpoint: t.string,
  statusCode: t.number,
  responseBody: t.unknown,
});

export const DiscordAllowedMentionsCodec = t.type({
  parse: t.readonlyArray(t.string),
});

export const DiscordButtonStyleCodec = t.union([
  t.literal(1),
  t.literal(2),
  t.literal(3),
  t.literal(4),
  t.literal(5),
]);

export const DiscordButtonComponentCodec = t.intersection([
  t.type({
    type: t.literal(2),
    label: t.string,
    style: DiscordButtonStyleCodec,
  }),
  t.partial({
    /**
     * Discord component wire key; internally generated from the control action context.
     */
    custom_id: t.string,
    url: t.string,
    disabled: t.boolean,
  }),
]);

export const DiscordActionRowComponentCodec = t.type({
  type: t.literal(1),
  components: t.readonlyArray(DiscordButtonComponentCodec),
});

export const DiscordMessagePayloadCodec = t.intersection([
  t.type({
    content: t.string,
  }),
  t.partial({
    /**
     * Discord message payload wire key for suppressing unwanted pings.
     */
    allowed_mentions: DiscordAllowedMentionsCodec,
    components: t.readonlyArray(DiscordActionRowComponentCodec),
    flags: t.number,
  }),
]);

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
    responsePayload: DiscordMessagePayloadCodec,
    threadPayload: DiscordMessagePayloadCodec,
    completionReceipt: DiscordResponseReceiptCodec,
    responsePostError: t.string,
    threadPostError: t.string,
    completionPostError: t.string,
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

/** Operator control action supported by Discord. */
export type DiscordControlAction = t.TypeOf<typeof DiscordControlActionCodec>;

/** Work item binding resolved from a Discord thread. */
export type DiscordWorkItemBinding = t.TypeOf<
  typeof DiscordWorkItemBindingCodec
>;

/** Control request routed from Discord to DevPlat. */
export type DiscordControlRequest = t.TypeOf<typeof DiscordControlRequestCodec>;

/** Result of handling a Discord control request. */
export type DiscordControlResult = t.TypeOf<typeof DiscordControlResultCodec>;

/** Operator interaction submitted through Discord. */
export type DiscordOperatorInteraction = t.TypeOf<
  typeof DiscordOperatorInteractionCodec
>;

/** Discord interaction callback payload. */
export type DiscordInteractionCallback = t.TypeOf<
  typeof DiscordInteractionCallbackCodec
>;

/** Context options used while converting callbacks to control requests. */
export type DiscordInteractionCallbackOptions = t.TypeOf<
  typeof DiscordInteractionCallbackOptionsCodec
>;

/** Successful interaction route. */
export type DiscordInteractionRouteSuccess = t.TypeOf<
  typeof DiscordInteractionRouteSuccessCodec
>;

/** Failed interaction route. */
export type DiscordInteractionRouteFailure = t.TypeOf<
  typeof DiscordInteractionRouteFailureCodec
>;

/** Result of routing a Discord interaction callback. */
export type DiscordInteractionRoute = t.TypeOf<
  typeof DiscordInteractionRouteCodec
>;

/** Receipt for a Discord response write. */
export type DiscordResponseReceipt = t.TypeOf<
  typeof DiscordResponseReceiptCodec
>;

/** Allowed mention configuration for Discord messages. */
export type DiscordAllowedMentions = t.TypeOf<
  typeof DiscordAllowedMentionsCodec
>;

/** Discord button style numeric value. */
export type DiscordButtonStyle = t.TypeOf<typeof DiscordButtonStyleCodec>;

/** Discord button component payload. */
export type DiscordButtonComponent = t.TypeOf<
  typeof DiscordButtonComponentCodec
>;

/** Discord action row component payload. */
export type DiscordActionRowComponent = t.TypeOf<
  typeof DiscordActionRowComponentCodec
>;

/** Structured Discord message payload. */
export type DiscordMessagePayload = t.TypeOf<typeof DiscordMessagePayloadCodec>;
