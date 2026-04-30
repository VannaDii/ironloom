import { appendTrace } from '@vannadii/devplat-core';

import type { PolicyDecision } from './types.js';

const sensitiveActions = new Set([
  'approve-this',
  'merge-now',
  'rebase-all-dependents',
  'sync-worktree',
  'release-worktree',
  'update-spec',
]);

const destructiveActions = new Set(['release-worktree']);

const externalPublishActions = new Set(['publish', 'publish-release']);

export function createPolicyDecision(input: PolicyDecision): PolicyDecision {
  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `policy:${input.action}`,
  );
}

export function evaluatePolicyDecision(
  action: string,
  privileged: boolean,
): PolicyDecision {
  const isDestructive = destructiveActions.has(action);
  const isExternalPublish = externalPublishActions.has(action);
  const requiresApproval =
    privileged ||
    sensitiveActions.has(action) ||
    isDestructive ||
    isExternalPublish;
  const allowed = !requiresApproval;
  const privilegeLevel = resolvePrivilegeLevel(
    isDestructive,
    isExternalPublish,
    requiresApproval,
  );

  return createPolicyDecision({
    id: `policy-${action}`,
    summary: `Policy evaluation for ${action}`,
    status: allowed ? 'approved' : 'review',
    trace: [],
    updatedAt: new Date().toISOString(),
    action,
    allowed,
    requiresApproval,
    auditRequired: requiresApproval,
    privilegeLevel,
    reason: allowed
      ? 'Action is within automatic policy limits.'
      : 'Action requires an explicit human approval path.',
  });
}

function resolvePrivilegeLevel(
  isDestructive: boolean,
  isExternalPublish: boolean,
  requiresApproval: boolean,
): PolicyDecision['privilegeLevel'] {
  if (isDestructive) {
    return 'destructive';
  }

  if (isExternalPublish) {
    return 'external-publish';
  }

  if (requiresApproval) {
    return 'human-approval';
  }

  return 'automatic';
}

export function describePolicyDecision(input: PolicyDecision): string {
  return `${input.action} -> ${input.reason}`;
}
