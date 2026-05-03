import {
  appendTrace,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_RETRY_GATES,
} from '@vannadii/devplat-core';
import type {
  ApprovalDecision,
  ApprovalSubjectType,
} from '@vannadii/devplat-artifacts';

import type { DiscordApprovalAction, DiscordApprovalRequest } from './codec.js';

/**
 * Ensures required Discord approval identifiers are non-empty.
 */
function assertIdentifier(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Discord approval ${name} must not be empty.`);
  }
}

/**
 * Normalizes and traces an approval request from the operator control plane.
 */
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

/**
 * Maps an approval button action onto the shared lifecycle policy action.
 */
export function mapApprovalActionToPolicyAction(
  action: DiscordApprovalAction,
): string {
  switch (action) {
    case 'approve':
      return DEVPLAT_ACTION_APPROVE_THIS;
    case 'retry':
      return DEVPLAT_ACTION_RETRY_GATES;
    case 'merge':
      return DEVPLAT_ACTION_MERGE_NOW;
    case 'escalate':
      return DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS;
  }
}

/**
 * Maps a Discord approval action to the lifecycle subject represented by its
 * bound artifact.
 */
export function mapApprovalActionToSubjectType(
  action: DiscordApprovalAction,
): ApprovalSubjectType {
  switch (action) {
    case 'approve':
      return 'slice';
    case 'retry':
      return 'slice';
    case 'merge':
      return 'pull-request';
    case 'escalate':
      return 'merge';
  }
}

/**
 * Converts a policy allow/deny result into an approval artifact decision.
 */
export function mapAllowedPolicyToApprovalDecision(
  allowed: boolean,
): ApprovalDecision {
  return allowed ? 'approved' : 'rejected';
}

/**
 * Summarizes an approval request for audit and telemetry display.
 */
export function describeDiscordApprovalRequest(
  input: DiscordApprovalRequest,
): string {
  return `${input.threadId}:${input.action} -> ${input.summary}`;
}
