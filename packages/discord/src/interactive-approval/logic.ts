import { appendTrace } from '@vannadii/devplat-core';

import type { DiscordApprovalAction, DiscordApprovalRequest } from './codec.js';

function assertIdentifier(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Discord approval ${name} must not be empty.`);
  }
}

export function createDiscordApprovalRequest(
  input: DiscordApprovalRequest,
): DiscordApprovalRequest {
  assertIdentifier('threadId', input.threadId);
  assertIdentifier('channelId', input.channelId);
  assertIdentifier('artifactId', input.artifactId);

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `discord:approval:${input.threadId}:${input.action}`,
  );
}

export function mapApprovalActionToPolicyAction(
  action: DiscordApprovalAction,
): string {
  switch (action) {
    case 'approve':
      return 'approve-this';
    case 'retry':
      return 'retry-gates';
    case 'merge':
      return 'merge-now';
    case 'escalate':
      return 'rebase-all-dependents';
  }
}

export function describeDiscordApprovalRequest(
  input: DiscordApprovalRequest,
): string {
  return `${input.threadId}:${input.action} -> ${input.summary}`;
}
