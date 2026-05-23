import { DEVPLAT_ACTION_SPEC, appendTrace } from '@vannadii/devplat-core';

import type {
  DiscordThreadSession,
  DiscordThreadSessionInput,
} from './codec.js';

/** Assert identifier. */
function assertIdentifier(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Discord thread session ${name} must not be empty.`);
  }
}

/** Assert positive integer. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Discord thread session ${name} must be a positive integer.`,
    );
  }
}

/** Creates discord thread session. */
export function createDiscordThreadSession(
  input: DiscordThreadSessionInput,
): DiscordThreadSession {
  assertIdentifier('guildId', input.guildId);
  assertIdentifier('channelId', input.channelId);
  assertIdentifier('parentChannelId', input.parentChannelId);
  assertIdentifier('threadId', input.threadId);
  assertIdentifier('artifactId', input.artifactId);
  const normalized = {
    id: input.id,
    summary: input.summary.trim(),
    status: input.status,
    trace: input.trace,
    updatedAt: new Date(input.updatedAt).toISOString(),
    guildId: input.guildId,
    channelId: input.channelId,
    parentChannelId: input.parentChannelId,
    threadId: input.threadId,
    artifactId: input.artifactId,
  };

  switch (input.kind) {
    case DEVPLAT_ACTION_SPEC:
      if (input.specId === null) {
        throw new Error('Spec threads must be linked to a specId.');
      }

      if (input.sliceId !== null) {
        throw new Error(
          'Spec threads must not be linked to implementation slices.',
        );
      }

      if (input.pullRequestNumber !== null) {
        throw new Error(
          'Only pull request threads may carry a pullRequestNumber.',
        );
      }

      return appendTrace(
        {
          ...normalized,
          kind: input.kind,
          specId: input.specId,
          sliceId: input.sliceId,
          pullRequestNumber: input.pullRequestNumber,
        },
        `discord:thread:${input.kind}:${input.threadId}`,
      );
    case 'implementation':
      if (input.sliceId === null) {
        throw new Error('Implementation threads must be linked to a sliceId.');
      }

      if (input.pullRequestNumber !== null) {
        throw new Error(
          'Only pull request threads may carry a pullRequestNumber.',
        );
      }

      return appendTrace(
        {
          ...normalized,
          kind: input.kind,
          specId: input.specId,
          sliceId: input.sliceId,
          pullRequestNumber: input.pullRequestNumber,
        },
        `discord:thread:${input.kind}:${input.threadId}`,
      );
    case 'pull-request':
      if (input.pullRequestNumber === null) {
        throw new Error(
          'Pull request threads must be linked to a pullRequestNumber.',
        );
      }

      assertPositiveInteger('pullRequestNumber', input.pullRequestNumber);

      return appendTrace(
        {
          ...normalized,
          kind: input.kind,
          specId: input.specId,
          sliceId: input.sliceId,
          pullRequestNumber: input.pullRequestNumber,
        },
        `discord:thread:${input.kind}:${input.threadId}`,
      );
  }
}

/** Describes discord thread session. */
export function describeDiscordThreadSession(
  input: DiscordThreadSession,
): string {
  return `${input.kind}:${input.threadId} -> ${input.summary}`;
}
