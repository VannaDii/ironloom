import { appendTrace } from '@vannadii/devplat-core';

import type {
  PolicyActionCategory,
  PolicyActionEvaluation,
  PolicyDecision,
  PolicyEscalationTarget,
  PolicyPrivilegeLevel,
  PolicyRiskLevel,
} from './codec.js';
import {
  POLICY_AUTOFIX_ACTIONS,
  POLICY_COMMAND_EXECUTION_ACTIONS,
  POLICY_DESTRUCTIVE_ACTIONS,
  POLICY_DESTRUCTIVE_CLEANUP_ACTIONS,
  POLICY_EXTERNAL_PUBLISH_ACTIONS,
  POLICY_MERGE_ACTIONS,
  POLICY_REBASE_ACTIONS,
  POLICY_SENSITIVE_ACTIONS,
} from './constants.js';

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
  const evaluation = evaluateLifecyclePolicyAction(action, privileged);

  return createPolicyDecision({
    id: evaluation.id,
    summary: `Policy evaluation for ${action}`,
    status: evaluation.allowed ? 'approved' : 'review',
    trace: [],
    updatedAt: evaluation.updatedAt,
    action,
    allowed: evaluation.allowed,
    requiresApproval: evaluation.requiresApproval,
    auditRequired: evaluation.auditRequired,
    privilegeLevel: evaluation.privilegeLevel,
    reason: evaluation.reason,
    actionCategory: evaluation.actionCategory,
    riskLevel: evaluation.riskLevel,
    escalationRequired: evaluation.escalationRequired,
    escalationTarget: evaluation.escalationTarget,
    nextAction: evaluation.nextAction,
    auditReason: evaluation.auditReason,
  });
}

export function evaluateLifecyclePolicyAction(
  action: string,
  privileged: boolean,
): PolicyActionEvaluation {
  const actionCategory = resolveActionCategory(action);
  const riskLevel = resolveRiskLevel(actionCategory, privileged);
  const requiresApproval = resolveRequiresApproval(
    action,
    actionCategory,
    privileged,
  );
  const allowed = !requiresApproval;
  const privilegeLevel = resolvePrivilegeLevel(
    actionCategory,
    requiresApproval,
  );
  const escalationRequired = requiresApproval;
  const escalationTarget = resolveEscalationTarget(actionCategory, riskLevel);
  const nextAction = resolveNextAction(actionCategory, allowed);
  const reason = allowed
    ? 'Action is within automatic policy limits.'
    : 'Action requires an explicit human approval path.';

  return {
    id: `policy-${action}`,
    action,
    actionCategory,
    privileged,
    allowed,
    requiresApproval,
    auditRequired: requiresApproval || actionCategory !== 'routine',
    privilegeLevel,
    riskLevel,
    escalationRequired,
    escalationTarget,
    reason,
    auditReason: `${action} evaluated as ${actionCategory} with ${riskLevel} risk: ${reason}`,
    nextAction,
    updatedAt: new Date().toISOString(),
  };
}

function resolveActionCategory(action: string): PolicyActionCategory {
  if (POLICY_MERGE_ACTIONS.includes(action)) {
    return 'merge';
  }

  if (POLICY_COMMAND_EXECUTION_ACTIONS.includes(action)) {
    return 'command-execution';
  }

  if (POLICY_DESTRUCTIVE_ACTIONS.includes(action)) {
    return 'worktree-release';
  }

  if (POLICY_REBASE_ACTIONS.includes(action)) {
    return 'rebase';
  }

  if (POLICY_EXTERNAL_PUBLISH_ACTIONS.includes(action)) {
    return 'publish';
  }

  if (POLICY_AUTOFIX_ACTIONS.includes(action)) {
    return 'autofix';
  }

  if (POLICY_DESTRUCTIVE_CLEANUP_ACTIONS.includes(action)) {
    return 'destructive-cleanup';
  }

  return 'routine';
}

function resolveRiskLevel(
  actionCategory: PolicyActionCategory,
  privileged: boolean,
): PolicyRiskLevel {
  if (
    actionCategory === 'worktree-release' ||
    actionCategory === 'destructive-cleanup'
  ) {
    return 'critical';
  }

  if (actionCategory === 'merge' || actionCategory === 'publish') {
    return 'high';
  }

  if (
    privileged ||
    actionCategory === 'rebase' ||
    actionCategory === 'autofix'
  ) {
    return 'medium';
  }

  return 'low';
}

function resolveRequiresApproval(
  action: string,
  actionCategory: PolicyActionCategory,
  privileged: boolean,
): boolean {
  return (
    privileged ||
    POLICY_SENSITIVE_ACTIONS.includes(action) ||
    actionCategory === 'merge' ||
    actionCategory === 'worktree-release' ||
    actionCategory === 'rebase' ||
    actionCategory === 'publish' ||
    actionCategory === 'autofix' ||
    actionCategory === 'destructive-cleanup'
  );
}

function resolvePrivilegeLevel(
  actionCategory: PolicyActionCategory,
  requiresApproval: boolean,
): PolicyPrivilegeLevel {
  if (
    actionCategory === 'worktree-release' ||
    actionCategory === 'destructive-cleanup'
  ) {
    return 'destructive';
  }

  if (actionCategory === 'publish') {
    return 'external-publish';
  }

  if (requiresApproval) {
    return 'human-approval';
  }

  return 'automatic';
}

function resolveEscalationTarget(
  actionCategory: PolicyActionCategory,
  riskLevel: PolicyRiskLevel,
): PolicyEscalationTarget {
  if (riskLevel === 'critical') {
    return 'maintainer';
  }

  if (actionCategory === 'publish') {
    return 'release-manager';
  }

  if (riskLevel === 'high' || riskLevel === 'medium') {
    return 'operator';
  }

  return 'none';
}

function resolveNextAction(
  actionCategory: PolicyActionCategory,
  allowed: boolean,
): string {
  if (allowed) {
    return actionCategory === 'command-execution'
      ? 'execute-with-audit'
      : 'continue';
  }

  switch (actionCategory) {
    case 'merge':
      return 'request-merge-approval';
    case 'command-execution':
      return 'request-command-approval';
    case 'worktree-release':
      return 'request-destructive-approval';
    case 'rebase':
      return 'request-rebase-approval';
    case 'publish':
      return 'request-publish-approval';
    case 'autofix':
      return 'request-autofix-approval';
    case 'destructive-cleanup':
      return 'request-destructive-approval';
    case 'routine':
      return 'continue';
  }
}

export function describePolicyDecision(input: PolicyDecision): string {
  return `${input.action} -> ${input.reason}`;
}
