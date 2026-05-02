import { appendTrace } from '@vannadii/devplat-core';

import { resolveDiscordCommandAction } from '../command-contract/logic.js';
import { DISCORD_COMPONENT_CUSTOM_ID_PREFIX } from './constants.js';
import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordInteractionCallback,
  DiscordInteractionCallbackOptions,
  DiscordInteractionRoute,
  DiscordOperatorInteraction,
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

const commandActionMap = new Map<string, DiscordControlAction>([
  ['run this', 'run-this'],
  ['run-this', 'run-this'],
  ['claim this', 'claim-this'],
  ['claim-this', 'claim-this'],
  ['approve this', 'approve-this'],
  ['approve-this', 'approve-this'],
  ['block this', 'block-this'],
  ['block-this', 'block-this'],
  ['complete this', 'complete-this'],
  ['complete-this', 'complete-this'],
  ['pause this', 'pause-this'],
  ['pause-this', 'pause-this'],
  ['resume this', 'resume-this'],
  ['resume-this', 'resume-this'],
  ['retry gates', 'retry-gates'],
  ['retry-gates', 'retry-gates'],
  ['merge now', 'merge-now'],
  ['merge-now', 'merge-now'],
  ['rebase dependents', 'rebase-all-dependents'],
  ['rebase-dependents', 'rebase-all-dependents'],
  ['rebase-all-dependents', 'rebase-all-dependents'],
  ['sync worktree', 'sync-worktree'],
  ['sync-worktree', 'sync-worktree'],
  ['release worktree', 'release-worktree'],
  ['release-worktree', 'release-worktree'],
  ['show status', 'show-status'],
  ['show-status', 'show-status'],
  ['show last artifact', 'show-last-artifact'],
  ['show-last-artifact', 'show-last-artifact'],
  ['explain failure', 'explain-failure'],
  ['explain-failure', 'explain-failure'],
  ['update spec', 'update-spec'],
  ['update-spec', 'update-spec'],
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

function normalizeActionToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed.startsWith('devplat:')
    ? trimmed.slice('devplat:'.length)
    : trimmed;
}

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

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

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

function resolveCallbackChannelId(input: DiscordInteractionCallback): string {
  const channelId = input.channel_id.trim();
  if (channelId.length === 0) {
    throw new Error('Discord interaction callback must include a channel id.');
  }

  return channelId;
}

export function createDiscordWorkItemBinding(
  session: DiscordThreadSession,
): DiscordWorkItemBinding {
  const base = {
    threadKind: session.kind,
    threadId: session.threadId,
    artifactId: session.artifactId,
  };

  switch (session.kind) {
    case 'spec':
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

export function describeDiscordControlRequest(
  input: DiscordControlRequest,
): string {
  return `${input.threadId}:${input.action} -> ${input.summary}`;
}

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
    ...(options.boundThreadId === undefined
      ? {}
      : { boundThreadId: options.boundThreadId }),
    ...(options.boundSession === undefined
      ? {}
      : { boundSession: options.boundSession }),
    ...(summary === undefined ? {} : { summary }),
    ...(options.privileged === undefined
      ? {}
      : { privileged: options.privileged }),
  };
}

function createInteractionControlRequestInput(
  input: DiscordOperatorInteraction,
  action: DiscordControlAction,
  threadId: string,
): DiscordControlRequest {
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
      privileged: input.privileged ?? false,
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
    privileged: input.privileged ?? false,
    workItem: createDiscordWorkItemBinding(input.boundSession),
  };
}

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
