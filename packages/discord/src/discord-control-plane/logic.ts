import { appendTrace } from '@vannadii/devplat-core';

import { resolveDiscordCommandAction } from '../command-contract/logic.js';
import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordInteractionRoute,
  DiscordOperatorInteraction,
  DiscordWorkItemBinding,
} from './types.js';
import type { DiscordThreadSession } from '../thread-session/types.js';

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
  const commandAction =
    normalizedCommand === undefined
      ? undefined
      : (commandActionMap.get(normalizedCommand) ??
        resolveDiscordCommandAction(normalizedCommand));
  const customAction = commandActionMap.get(
    normalizeActionToken(input.customId) ?? '',
  );

  if (commandAction !== undefined && customAction !== undefined) {
    return commandAction === customAction ? commandAction : undefined;
  }

  return commandAction ?? customAction;
}

function collectThreadCandidates(
  input: DiscordOperatorInteraction,
): readonly string[] {
  return [
    ...(input.threadId === undefined ? [] : [input.threadId.trim()]),
    ...(input.boundThreadId === undefined ? [] : [input.boundThreadId.trim()]),
    ...(input.boundSession === undefined
      ? []
      : [input.boundSession.threadId.trim()]),
  ].filter((value) => value.length > 0);
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
