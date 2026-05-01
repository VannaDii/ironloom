import { appendTrace } from '@vannadii/devplat-core';

import type {
  DiscordChannelBinding,
  DiscordThreadBindingResult,
} from './codec.js';

function assertIdentifier(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Discord channel binding ${name} must not be empty.`);
  }
}

export function createDiscordChannelBinding(
  input: DiscordChannelBinding,
): DiscordChannelBinding {
  assertIdentifier('guildId', input.guildId);
  assertIdentifier('channelId', input.channelId);

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `discord:binding:${input.kind}:${input.channelId}`,
  );
}

export function createDiscordThreadBindingResult(
  binding: DiscordChannelBinding,
  threadId: string,
  parentChannelId: string,
): Omit<DiscordThreadBindingResult, 'persistedKey'> {
  assertIdentifier('threadId', threadId);
  assertIdentifier('parentChannelId', parentChannelId);
  if (binding.channelId !== parentChannelId) {
    throw new Error(
      'Discord thread bindings must inherit from the bound parent channel.',
    );
  }

  return {
    binding,
    threadId,
    parentChannelId,
    routingKey: `${binding.guildId}:${binding.kind}:${threadId}`,
    inherited: true,
  };
}

export function describeDiscordChannelBinding(
  input: DiscordChannelBinding,
): string {
  return `${input.kind}:${input.guildId}:${input.channelId}`;
}
