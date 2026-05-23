import {
  appendTrace,
  DEVPLAT_ACTION_CANCEL_PROJECT,
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_RELEASE_PROJECT,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_REBASE_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SPEC,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
  DEVPLAT_ACTION_PAUSE_THIS,
} from '@vannadii/devplat-core';

import { resolveDiscordCommandAction } from '../command-contract/logic.js';
import { DISCORD_COMPONENT_CUSTOM_ID_PREFIX } from './constants.js';
import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordInteractionCallback,
  DiscordInteractionCallbackOptions,
  DiscordInteractionRoute,
  DiscordOperatorInteraction,
  DiscordReceivedEventDataSnapshot,
  DiscordReceivedEventMemberSnapshot,
  DiscordReceivedEventSnapshot,
  DiscordReceivedEventUserSnapshot,
  DiscordWorkItemBinding,
} from './codec.js';
import type { DiscordThreadSession } from '../thread-session/codec.js';

/**
 * Parsed DevPlat component custom-id context.
 */
type DiscordComponentCustomIdContext = {
  readonly action: DiscordControlAction;
  readonly threadId: string;
};

/**
 * Named operator roles used by Discord-side privilege derivation.
 */
type DevplatOperatorRole =
  | 'project-operator'
  | 'spec-approver'
  | 'merge-approver';

/**
 * Human and component action tokens accepted by the operator router.
 */
const commandActionMap = new Map<string, DiscordControlAction>([
  ['run this', DEVPLAT_ACTION_RUN_THIS],
  [DEVPLAT_ACTION_RUN_THIS, DEVPLAT_ACTION_RUN_THIS],
  ['claim this', DEVPLAT_ACTION_CLAIM_THIS],
  [DEVPLAT_ACTION_CLAIM_THIS, DEVPLAT_ACTION_CLAIM_THIS],
  ['approve this', DEVPLAT_ACTION_APPROVE_THIS],
  [DEVPLAT_ACTION_APPROVE_THIS, DEVPLAT_ACTION_APPROVE_THIS],
  ['block this', DEVPLAT_ACTION_BLOCK_THIS],
  [DEVPLAT_ACTION_BLOCK_THIS, DEVPLAT_ACTION_BLOCK_THIS],
  ['complete this', DEVPLAT_ACTION_COMPLETE_THIS],
  [DEVPLAT_ACTION_COMPLETE_THIS, DEVPLAT_ACTION_COMPLETE_THIS],
  ['pause this', DEVPLAT_ACTION_PAUSE_THIS],
  [DEVPLAT_ACTION_PAUSE_THIS, DEVPLAT_ACTION_PAUSE_THIS],
  ['resume this', DEVPLAT_ACTION_RESUME_THIS],
  [DEVPLAT_ACTION_RESUME_THIS, DEVPLAT_ACTION_RESUME_THIS],
  ['retry gates', DEVPLAT_ACTION_RETRY_GATES],
  [DEVPLAT_ACTION_RETRY_GATES, DEVPLAT_ACTION_RETRY_GATES],
  ['merge now', DEVPLAT_ACTION_MERGE_NOW],
  [DEVPLAT_ACTION_MERGE_NOW, DEVPLAT_ACTION_MERGE_NOW],
  ['rebase dependents', DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS],
  [DEVPLAT_ACTION_REBASE_DEPENDENTS, DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS],
  [DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS, DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS],
  ['sync worktree', DEVPLAT_ACTION_SYNC_WORKTREE],
  [DEVPLAT_ACTION_SYNC_WORKTREE, DEVPLAT_ACTION_SYNC_WORKTREE],
  ['release worktree', DEVPLAT_ACTION_RELEASE_WORKTREE],
  [DEVPLAT_ACTION_RELEASE_WORKTREE, DEVPLAT_ACTION_RELEASE_WORKTREE],
  ['show status', DEVPLAT_ACTION_SHOW_STATUS],
  [DEVPLAT_ACTION_SHOW_STATUS, DEVPLAT_ACTION_SHOW_STATUS],
  ['show last artifact', DEVPLAT_ACTION_SHOW_LAST_ARTIFACT],
  [DEVPLAT_ACTION_SHOW_LAST_ARTIFACT, DEVPLAT_ACTION_SHOW_LAST_ARTIFACT],
  ['explain failure', DEVPLAT_ACTION_EXPLAIN_FAILURE],
  [DEVPLAT_ACTION_EXPLAIN_FAILURE, DEVPLAT_ACTION_EXPLAIN_FAILURE],
  ['update spec', DEVPLAT_ACTION_UPDATE_SPEC],
  [DEVPLAT_ACTION_UPDATE_SPEC, DEVPLAT_ACTION_UPDATE_SPEC],
]);

/**
 * Resolves a known action token into a control action.
 */
function resolveKnownAction(
  value: string | undefined,
): DiscordControlAction | undefined {
  return value === undefined
    ? undefined
    : (commandActionMap.get(value) ?? resolveDiscordCommandAction(value));
}

/**
 * Parses the versioned component custom id produced by the Discord renderer.
 */
function parseDiscordComponentCustomId(
  value: string | undefined,
): DiscordComponentCustomIdContext | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  const prefix = `${DISCORD_COMPONENT_CUSTOM_ID_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) {
    return undefined;
  }

  const suffix = trimmed.slice(prefix.length);
  const separatorIndex = suffix.indexOf(':');
  if (
    separatorIndex < 1 ||
    separatorIndex === suffix.length - 1 ||
    suffix.indexOf(':', separatorIndex + 1) !== -1
  ) {
    return undefined;
  }

  const actionToken = suffix.slice(0, separatorIndex);
  const threadToken = suffix.slice(separatorIndex + 1);
  const action = resolveKnownAction(actionToken);
  const threadId = threadToken.trim();
  if (action === undefined || threadId.length === 0) {
    return undefined;
  }

  return {
    action,
    threadId,
  };
}

/**
 * Extracts the encoded thread id from a DevPlat Discord component custom id.
 */
export function resolveDiscordComponentThreadId(
  value: string | undefined,
): string | undefined {
  return parseDiscordComponentCustomId(value)?.threadId;
}

/** Normalizes action token. */
function normalizeActionToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed.startsWith('devplat:')
    ? trimmed.slice('devplat:'.length)
    : trimmed;
}

/** Resolves action. */
function resolveAction(
  input: DiscordOperatorInteraction,
): DiscordControlAction | undefined {
  const normalizedCommand = normalizeActionToken(input.commandName);
  const commandAction = resolveKnownAction(normalizedCommand);
  const componentContext = parseDiscordComponentCustomId(input.customId);
  const customAction =
    componentContext?.action ??
    commandActionMap.get(normalizeActionToken(input.customId) ?? '');

  if (commandAction !== undefined && customAction !== undefined) {
    return commandAction === customAction ? commandAction : undefined;
  }

  return commandAction ?? customAction;
}

/** Collects thread candidates. */
function collectThreadCandidates(
  input: DiscordOperatorInteraction,
): readonly string[] {
  const componentContext = parseDiscordComponentCustomId(input.customId);

  return [
    ...(input.threadId === undefined ? [] : [input.threadId.trim()]),
    ...(input.boundThreadId === undefined ? [] : [input.boundThreadId.trim()]),
    ...(componentContext === undefined ? [] : [componentContext.threadId]),
    ...(input.boundSession === undefined
      ? []
      : [input.boundSession.threadId.trim()]),
  ].filter((value) => value.length > 0);
}

/** Trims an optional string value. */
function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

/**
 * Creates the minimal command data snapshot used by route-failure diagnostics.
 */
function createDiscordReceivedEventDataSnapshot(
  input: DiscordInteractionCallback['data'],
): DiscordReceivedEventDataSnapshot | undefined {
  const name = trimOptional(input?.name);
  const customId = trimOptional(input?.custom_id);

  if (name === undefined && customId === undefined) {
    return undefined;
  }

  return {
    ...(name === undefined ? {} : { name }),
    ...(customId === undefined ? {} : { custom_id: customId }),
  };
}

/**
 * Creates the minimal user identity snapshot used by route-failure diagnostics.
 */
function createDiscordReceivedEventUserSnapshot(
  input: DiscordInteractionCallback['user'],
): DiscordReceivedEventUserSnapshot | undefined {
  const id = trimOptional(input?.id);
  return id === undefined ? undefined : { id };
}

/**
 * Creates the minimal member identity snapshot used by route-failure diagnostics.
 */
function createDiscordReceivedEventMemberSnapshot(
  input: DiscordInteractionCallback['member'],
): DiscordReceivedEventMemberSnapshot | undefined {
  const user = createDiscordReceivedEventUserSnapshot(input?.user);
  if (user === undefined) {
    return undefined;
  }

  const roles = input?.roles?.map((roleId) => roleId.trim()).filter(Boolean);
  return roles === undefined || roles.length === 0 ? { user } : { user, roles };
}

/**
 * Creates the bounded received-event diagnostic used by route failures.
 */
function createDiscordReceivedEventSnapshot(
  input: DiscordInteractionCallback,
): DiscordReceivedEventSnapshot {
  const data = createDiscordReceivedEventDataSnapshot(input.data);
  const member = createDiscordReceivedEventMemberSnapshot(input.member);
  const user = createDiscordReceivedEventUserSnapshot(input.user);

  return {
    id: input.id,
    token: input.token,
    channel_id: input.channel_id,
    ...(data === undefined ? {} : { data }),
    ...(member === undefined ? {} : { member }),
    ...(user === undefined ? {} : { user }),
  };
}

/** Resolves callback actor id. */
function resolveCallbackActorId(input: DiscordInteractionCallback): string {
  const memberUserId = trimOptional(input.member?.user.id);
  if (memberUserId !== undefined) {
    return memberUserId;
  }

  const directUserId = trimOptional(input.user?.id);
  if (directUserId !== undefined) {
    return directUserId;
  }

  throw new Error(
    'Discord interaction callback must include an actor user id.',
  );
}

/** Resolves callback channel id. */
function resolveCallbackChannelId(input: DiscordInteractionCallback): string {
  const channelId = input.channel_id.trim();
  if (channelId.length === 0) {
    throw new Error('Discord interaction callback must include a channel id.');
  }

  return channelId;
}

/** Creates discord work item binding. */
export function createDiscordWorkItemBinding(
  session: DiscordThreadSession,
): DiscordWorkItemBinding {
  const base = {
    threadKind: session.kind,
    threadId: session.threadId,
    artifactId: session.artifactId,
  };

  switch (session.kind) {
    case DEVPLAT_ACTION_SPEC:
      return {
        ...base,
        specId: session.specId,
      };
    case 'implementation':
      return session.specId === null
        ? {
            ...base,
            sliceId: session.sliceId,
          }
        : {
            ...base,
            specId: session.specId,
            sliceId: session.sliceId,
          };
    case 'pull-request':
      return {
        ...base,
        ...(session.specId === null ? {} : { specId: session.specId }),
        ...(session.sliceId === null ? {} : { sliceId: session.sliceId }),
        pullRequestNumber: session.pullRequestNumber,
      };
  }
}

/** Describes discord work item binding. */
export function describeDiscordWorkItemBinding(
  input: DiscordWorkItemBinding,
): string {
  if (input.threadKind === 'pull-request') {
    return input.pullRequestNumber === undefined
      ? `pull-request ${input.threadId}`
      : `pull-request #${String(input.pullRequestNumber)} in ${input.threadId}`;
  }

  if (input.threadKind === 'implementation') {
    return input.sliceId === undefined
      ? `implementation ${input.threadId}`
      : `implementation ${input.sliceId} in ${input.threadId}`;
  }

  return input.specId === undefined
    ? `spec ${input.threadId}`
    : `spec ${input.specId} in ${input.threadId}`;
}

/** Creates discord control request. */
export function createDiscordControlRequest(
  input: DiscordControlRequest,
): DiscordControlRequest {
  if (input.threadId.trim().length === 0) {
    throw new Error('Discord control requests must be scoped to a thread.');
  }

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `discord:${input.threadId}:${input.action}`,
  );
}

/** Describes discord control request. */
export function describeDiscordControlRequest(
  input: DiscordControlRequest,
): string {
  return `${input.threadId}:${input.action} -> ${input.summary}`;
}

/** Creates discord operator interaction from callback. */
export function createDiscordOperatorInteractionFromCallback(
  input: DiscordInteractionCallback,
  options: DiscordInteractionCallbackOptions = {},
): DiscordOperatorInteraction {
  const channelId = resolveCallbackChannelId(input);
  const commandName = trimOptional(input.data?.name);
  const customId = trimOptional(input.data?.custom_id);
  const summary = trimOptional(options.summary);

  return {
    id: input.id,
    token: input.token,
    actorId: resolveCallbackActorId(input),
    channelId,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    threadId: options.threadId ?? channelId,
    ...(commandName === undefined ? {} : { commandName }),
    ...(customId === undefined ? {} : { customId }),
    receivedEvent: createDiscordReceivedEventSnapshot(input),
    ...(options.boundThreadId === undefined
      ? {}
      : { boundThreadId: options.boundThreadId }),
    ...(options.boundSession === undefined
      ? {}
      : { boundSession: options.boundSession }),
    ...(summary === undefined ? {} : { summary }),
    ...(input.member?.roles === undefined
      ? {}
      : {
          actorRoleIds: input.member.roles
            .map((roleId) => roleId.trim())
            .filter((roleId) => roleId.length > 0),
        }),
    ...(options.projectOperatorRoleId === undefined
      ? {}
      : { projectOperatorRoleId: options.projectOperatorRoleId }),
    ...(options.specApproverRoleId === undefined
      ? {}
      : { specApproverRoleId: options.specApproverRoleId }),
    ...(options.mergeApproverRoleId === undefined
      ? {}
      : { mergeApproverRoleId: options.mergeApproverRoleId }),
    ...(options.privileged === undefined
      ? {}
      : { privileged: options.privileged }),
  };
}

/** Resolves required operator roles for an action in the current thread context. */
function resolveRequiredRolesForAction(
  action: DiscordControlAction,
  input: DiscordOperatorInteraction,
): readonly DevplatOperatorRole[] {
  switch (action) {
    case DEVPLAT_ACTION_NEW_PROJECT:
    case DEVPLAT_ACTION_OPEN_PROJECT:
    case DEVPLAT_ACTION_PROJECT_SETTINGS:
    case DEVPLAT_ACTION_CANCEL_PROJECT:
      return ['project-operator'];
    case DEVPLAT_ACTION_RELEASE_PROJECT:
      return ['project-operator', 'merge-approver'];
    case DEVPLAT_ACTION_APPROVE_THIS:
      return input.boundSession?.kind === 'pull-request'
        ? ['merge-approver']
        : ['spec-approver'];
    case DEVPLAT_ACTION_MERGE_NOW:
      return ['merge-approver'];
    default:
      return [];
  }
}

/** Resolves the configured Discord role id for a named DevPlat operator role. */
function resolveRoleIdForOperatorRole(
  role: DevplatOperatorRole,
  input: DiscordOperatorInteraction,
): string | undefined {
  switch (role) {
    case 'project-operator':
      return trimOptional(input.projectOperatorRoleId);
    case 'spec-approver':
      return trimOptional(input.specApproverRoleId);
    case 'merge-approver':
      return trimOptional(input.mergeApproverRoleId);
  }
}

/** Returns true when the actor holds at least one required role for this action. */
function isActionPrivilegedForInteraction(
  action: DiscordControlAction,
  input: DiscordOperatorInteraction,
): boolean {
  const requiredRoles = resolveRequiredRolesForAction(action, input);
  if (requiredRoles.length === 0) {
    return false;
  }

  const actorRoleIds = (input.actorRoleIds ?? []).map((roleId) =>
    roleId.trim(),
  );
  return requiredRoles.some((role) => {
    const requiredRoleId = resolveRoleIdForOperatorRole(role, input);
    return requiredRoleId === undefined
      ? false
      : actorRoleIds.includes(requiredRoleId);
  });
}

/** Creates interaction control request input. */
function createInteractionControlRequestInput(
  input: DiscordOperatorInteraction,
  action: DiscordControlAction,
  threadId: string,
): DiscordControlRequest {
  const privileged =
    input.privileged ?? isActionPrivilegedForInteraction(action, input);
  if (input.boundSession === undefined) {
    return {
      id: input.id,
      summary: input.summary?.trim() ?? action,
      status: 'running',
      trace: [],
      updatedAt: input.updatedAt,
      actorId: input.actorId,
      threadId,
      channelId: input.channelId,
      action,
      privileged,
    };
  }

  return {
    id: input.id,
    summary: input.summary?.trim() ?? action,
    status: 'running',
    trace: [],
    updatedAt: input.updatedAt,
    actorId: input.actorId,
    threadId,
    channelId: input.channelId,
    action,
    privileged,
    workItem: createDiscordWorkItemBinding(input.boundSession),
  };
}

/** Creates discord control request from interaction. */
export function createDiscordControlRequestFromInteraction(
  input: DiscordOperatorInteraction,
): DiscordInteractionRoute {
  const action = resolveAction(input);
  if (action === undefined) {
    return {
      ok: false,
      interactionId: input.id,
      reason: 'Discord interaction action is not recognized.',
    };
  }

  const threadCandidates = [...new Set(collectThreadCandidates(input))];
  if (threadCandidates.length !== 1) {
    return {
      ok: false,
      interactionId: input.id,
      reason: 'Discord interaction must resolve to exactly one bound thread.',
    };
  }

  const threadId = threadCandidates.join('');

  return {
    ok: true,
    request: createDiscordControlRequest(
      createInteractionControlRequestInput(input, action, threadId),
    ),
  };
}
