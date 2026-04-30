import { appendTrace } from '@vannadii/devplat-core';

import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordInteractionRoute,
  DiscordOperatorInteraction,
} from './types.js';

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
  const commandAction = commandActionMap.get(
    normalizeActionToken(input.commandName) ?? '',
  );
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
  ].filter((value) => value.length > 0);
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
    request: createDiscordControlRequest({
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
    }),
  };
}
