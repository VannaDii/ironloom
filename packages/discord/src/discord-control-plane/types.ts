import type { LifecycleStatus } from '@vannadii/devplat-core';

export type DiscordControlAction =
  | 'run-this'
  | 'claim-this'
  | 'approve-this'
  | 'block-this'
  | 'complete-this'
  | 'pause-this'
  | 'resume-this'
  | 'rebase-all-dependents'
  | 'retry-gates'
  | 'merge-now'
  | 'show-status'
  | 'show-last-artifact'
  | 'explain-failure'
  | 'sync-worktree'
  | 'release-worktree'
  | 'update-spec';

export interface DiscordControlRequest {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  actorId: string;
  threadId: string;
  channelId: string;
  action: DiscordControlAction;
  privileged: boolean;
}

export interface DiscordControlResult {
  request: DiscordControlRequest;
  policyDecisionId: string;
  allowed: boolean;
  persistedKey: string;
  responseReceipt?: DiscordResponseReceipt;
  threadReceipt?: DiscordResponseReceipt;
  failedClosed: boolean;
}

export interface DiscordOperatorInteraction {
  id: string;
  token: string;
  actorId: string;
  channelId: string;
  updatedAt: string;
  commandName?: string;
  customId?: string;
  summary?: string;
  threadId?: string;
  boundThreadId?: string;
  privileged?: boolean;
}

export interface DiscordInteractionRouteSuccess {
  ok: true;
  request: DiscordControlRequest;
}

export interface DiscordInteractionRouteFailure {
  ok: false;
  interactionId: string;
  reason: string;
}

export type DiscordInteractionRoute =
  | DiscordInteractionRouteSuccess
  | DiscordInteractionRouteFailure;

export interface DiscordResponseReceipt {
  endpoint: string;
  statusCode: number;
  responseBody: unknown;
}
