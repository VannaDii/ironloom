import * as t from 'io-ts';

import {
  DEVPLAT_ACTION_ALTERNATIVES,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CANCEL_PROJECT,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_CONSIDER,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_PHASE_CONTRACT,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
  DEVPLAT_ACTION_PROJECT_SUMMARY,
  DEVPLAT_ACTION_REDIRECT,
  DEVPLAT_ACTION_RELEASE_PROJECT,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESEARCH,
  DEVPLAT_ACTION_RESUME_PROJECT,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SPEC,
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

/** Codec for discord control action. */
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
  t.literal(DEVPLAT_ACTION_NEW_PROJECT),
  t.literal(DEVPLAT_ACTION_OPEN_PROJECT),
  t.literal(DEVPLAT_ACTION_PROJECT_SUMMARY),
  t.literal(DEVPLAT_ACTION_PROJECT_SETTINGS),
  t.literal(DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY),
  t.literal(DEVPLAT_ACTION_CANCEL_PROJECT),
  t.literal(DEVPLAT_ACTION_RESUME_PROJECT),
  t.literal(DEVPLAT_ACTION_RELEASE_PROJECT),
  t.literal(DEVPLAT_ACTION_PHASE_CONTRACT),
  t.literal(DEVPLAT_ACTION_ALTERNATIVES),
  t.literal(DEVPLAT_ACTION_REDIRECT),
  t.literal(DEVPLAT_ACTION_CONSIDER),
  t.literal(DEVPLAT_ACTION_RESEARCH),
  t.literal(DEVPLAT_ACTION_SPEC),
]);

/** Codec for discord work item binding. */
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

/** Codec for discord control request. */
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

/** Codec for minimal received Discord callback data retained for diagnostics. */
export const DiscordReceivedEventDataSnapshotCodec = t.exact(
  t.partial({
    name: t.string,
    /**
     * Discord interaction callback wire key; internally normalized to `customId`.
     */
    custom_id: t.string,
  }),
);

/** Codec for minimal received Discord user identity retained for diagnostics. */
export const DiscordReceivedEventUserSnapshotCodec = t.exact(
  t.type({
    id: t.string,
  }),
);

/** Codec for minimal received Discord member identity retained for diagnostics. */
export const DiscordReceivedEventMemberSnapshotCodec = t.exact(
  t.intersection([
    t.type({
      user: DiscordReceivedEventUserSnapshotCodec,
    }),
    t.partial({
      roles: t.readonlyArray(t.string),
    }),
  ]),
);

/** Codec for bounded received Discord callback diagnostics. */
export const DiscordReceivedEventSnapshotCodec = t.exact(
  t.intersection([
    t.type({
      id: t.string,
      token: t.string,
      /**
       * Discord interaction callback wire key; internally normalized to `channelId`.
       */
      channel_id: t.string,
    }),
    t.partial({
      data: DiscordReceivedEventDataSnapshotCodec,
      member: DiscordReceivedEventMemberSnapshotCodec,
      user: DiscordReceivedEventUserSnapshotCodec,
    }),
  ]),
);

/** Codec for discord operator interaction. */
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
    receivedEvent: DiscordReceivedEventSnapshotCodec,
    actorRoleIds: t.readonlyArray(t.string),
    projectOperatorRoleId: t.string,
    specApproverRoleId: t.string,
    mergeApproverRoleId: t.string,
    openProjectIntent: t.union([
      t.literal('maintenance'),
      t.literal('bugfix'),
      t.literal('new-feature'),
    ]),
    projectRepo: t.string,
    projectName: t.string,
    redirectPrompt: t.string,
    considerUrl: t.string,
    newProjectQualityStrictness: t.union([t.literal('on'), t.literal('off')]),
    projectSettingsHistoryDetailed: t.boolean,
    resumeProjectForce: t.boolean,
    privileged: t.boolean,
  }),
]);

/** Codec for discord interaction callback user. */
export const DiscordInteractionCallbackUserCodec = t.type({
  id: t.string,
});

/** Codec for discord interaction callback member. */
export const DiscordInteractionCallbackMemberCodec = t.intersection([
  t.type({
    user: DiscordInteractionCallbackUserCodec,
  }),
  t.partial({
    roles: t.readonlyArray(t.string),
  }),
]);

/** Codec for discord interaction callback data. */
export const DiscordInteractionCallbackDataCodec = t.partial({
  name: t.string,
  /**
   * Discord interaction callback wire key; internally normalized to `customId`.
   */
  custom_id: t.string,
  options: t.readonlyArray(
    t.type({
      name: t.string,
      value: t.string,
    }),
  ),
});

/** Codec for discord interaction callback. */
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

/** Codec for discord interaction callback options. */
export const DiscordInteractionCallbackOptionsCodec = t.partial({
  threadId: t.string,
  boundThreadId: t.string,
  boundSession: DiscordThreadSessionCodec,
  summary: t.string,
  projectOperatorRoleId: t.string,
  specApproverRoleId: t.string,
  mergeApproverRoleId: t.string,
  openProjectIntent: t.union([
    t.literal('maintenance'),
    t.literal('bugfix'),
    t.literal('new-feature'),
  ]),
  projectRepo: t.string,
  projectName: t.string,
  redirectPrompt: t.string,
  considerUrl: t.string,
  newProjectQualityStrictness: t.union([t.literal('on'), t.literal('off')]),
  projectSettingsHistoryDetailed: t.boolean,
  resumeProjectForce: t.boolean,
  privileged: t.boolean,
  updatedAt: IsoTimestampCodec,
});

/** Codec for discord response receipt. */
export const DiscordResponseReceiptCodec = t.type({
  endpoint: t.string,
  statusCode: t.number,
  responseBody: t.unknown,
});

/** Codec for discord allowed mentions. */
export const DiscordAllowedMentionsCodec = t.type({
  parse: t.readonlyArray(t.string),
});

/** Codec for discord button style. */
export const DiscordButtonStyleCodec = t.union([
  t.literal(1),
  t.literal(2),
  t.literal(3),
  t.literal(4),
  t.literal(5),
]);

/** Codec for discord button component. */
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

/** Codec for discord action row component. */
export const DiscordActionRowComponentCodec = t.type({
  type: t.literal(1),
  components: t.readonlyArray(DiscordButtonComponentCodec),
});

/** Codec for discord message payload. */
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

/** Codec for discord control result. */
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
    blockedReason: t.string,
  }),
]);

/** Codec for discord interaction route success. */
export const DiscordInteractionRouteSuccessCodec = t.type({
  ok: t.literal(true),
  request: DiscordControlRequestCodec,
});

/** Codec for discord interaction route failure. */
export const DiscordInteractionRouteFailureCodec = t.type({
  ok: t.literal(false),
  interactionId: t.string,
  reason: t.string,
});

/** Codec for discord interaction route. */
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

/** Minimal received Discord callback data retained for diagnostics. */
export type DiscordReceivedEventDataSnapshot = t.TypeOf<
  typeof DiscordReceivedEventDataSnapshotCodec
>;

/** Minimal received Discord user identity retained for diagnostics. */
export type DiscordReceivedEventUserSnapshot = t.TypeOf<
  typeof DiscordReceivedEventUserSnapshotCodec
>;

/** Minimal received Discord member identity retained for diagnostics. */
export type DiscordReceivedEventMemberSnapshot = t.TypeOf<
  typeof DiscordReceivedEventMemberSnapshotCodec
>;

/** Bounded received Discord callback diagnostic. */
export type DiscordReceivedEventSnapshot = t.TypeOf<
  typeof DiscordReceivedEventSnapshotCodec
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
