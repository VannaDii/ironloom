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
  POLICY_ACTION_CATEGORY_AUTOFIX,
  POLICY_ACTION_CATEGORY_COMMAND_EXECUTION,
  POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP,
  POLICY_ACTION_CATEGORY_MERGE,
  POLICY_ACTION_CATEGORY_PUBLISH,
  POLICY_ACTION_CATEGORY_REBASE,
  POLICY_ACTION_CATEGORY_ROUTINE,
  POLICY_ACTION_CATEGORY_WORKTREE_RELEASE,
  POLICY_AUTOFIX_ACTIONS,
  POLICY_COMMAND_EXECUTION_ACTIONS,
  POLICY_DESTRUCTIVE_ACTIONS,
  POLICY_DESTRUCTIVE_CLEANUP_ACTIONS,
  POLICY_EXTERNAL_PUBLISH_ACTIONS,
  POLICY_MERGE_ACTIONS,
  POLICY_REBASE_ACTIONS,
  POLICY_SENSITIVE_ACTIONS,
} from './constants.js';

/** Creates policy decision. */
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

/** Evaluate policy decision. */
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

/** Evaluate lifecycle policy action. */
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

/** Resolves action category. */
function resolveActionCategory(action: string): PolicyActionCategory {
  if (POLICY_MERGE_ACTIONS.includes(action)) {
    return POLICY_ACTION_CATEGORY_MERGE;
  }

  if (POLICY_COMMAND_EXECUTION_ACTIONS.includes(action)) {
    return POLICY_ACTION_CATEGORY_COMMAND_EXECUTION;
  }

  if (POLICY_DESTRUCTIVE_ACTIONS.includes(action)) {
    return POLICY_ACTION_CATEGORY_WORKTREE_RELEASE;
  }

  if (POLICY_REBASE_ACTIONS.includes(action)) {
    return POLICY_ACTION_CATEGORY_REBASE;
  }

  if (POLICY_EXTERNAL_PUBLISH_ACTIONS.includes(action)) {
    return POLICY_ACTION_CATEGORY_PUBLISH;
  }

  if (POLICY_AUTOFIX_ACTIONS.includes(action)) {
    return POLICY_ACTION_CATEGORY_AUTOFIX;
  }

  if (POLICY_DESTRUCTIVE_CLEANUP_ACTIONS.includes(action)) {
    return POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP;
  }

  return POLICY_ACTION_CATEGORY_ROUTINE;
}

/** Resolves risk level. */
function resolveRiskLevel(
  actionCategory: PolicyActionCategory,
  privileged: boolean,
): PolicyRiskLevel {
  if (
    actionCategory === POLICY_ACTION_CATEGORY_WORKTREE_RELEASE ||
    actionCategory === POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP
  ) {
    return 'critical';
  }

  if (
    actionCategory === POLICY_ACTION_CATEGORY_MERGE ||
    actionCategory === POLICY_ACTION_CATEGORY_PUBLISH
  ) {
    return 'high';
  }

  if (
    privileged ||
    actionCategory === POLICY_ACTION_CATEGORY_REBASE ||
    actionCategory === POLICY_ACTION_CATEGORY_AUTOFIX
  ) {
    return 'medium';
  }

  return 'low';
}

/** Resolves requires approval. */
function resolveRequiresApproval(
  action: string,
  actionCategory: PolicyActionCategory,
  privileged: boolean,
): boolean {
  return (
    privileged ||
    POLICY_SENSITIVE_ACTIONS.includes(action) ||
    actionCategory === POLICY_ACTION_CATEGORY_MERGE ||
    actionCategory === POLICY_ACTION_CATEGORY_WORKTREE_RELEASE ||
    actionCategory === POLICY_ACTION_CATEGORY_REBASE ||
    actionCategory === POLICY_ACTION_CATEGORY_PUBLISH ||
    actionCategory === POLICY_ACTION_CATEGORY_AUTOFIX ||
    actionCategory === POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP
  );
}

/** Resolves privilege level. */
function resolvePrivilegeLevel(
  actionCategory: PolicyActionCategory,
  requiresApproval: boolean,
): PolicyPrivilegeLevel {
  if (
    actionCategory === POLICY_ACTION_CATEGORY_WORKTREE_RELEASE ||
    actionCategory === POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP
  ) {
    return 'destructive';
  }

  if (actionCategory === POLICY_ACTION_CATEGORY_PUBLISH) {
    return 'external-publish';
  }

  if (requiresApproval) {
    return 'human-approval';
  }

  return 'automatic';
}

/** Resolves escalation target. */
function resolveEscalationTarget(
  actionCategory: PolicyActionCategory,
  riskLevel: PolicyRiskLevel,
): PolicyEscalationTarget {
  if (riskLevel === 'critical') {
    return 'maintainer';
  }

  if (actionCategory === POLICY_ACTION_CATEGORY_PUBLISH) {
    return 'release-manager';
  }

  if (riskLevel === 'high' || riskLevel === 'medium') {
    return 'operator';
  }

  return 'none';
}

/** Resolves next action. */
function resolveNextAction(
  actionCategory: PolicyActionCategory,
  allowed: boolean,
): string {
  if (allowed) {
    return actionCategory === POLICY_ACTION_CATEGORY_COMMAND_EXECUTION
      ? 'execute-with-audit'
      : 'continue';
  }

  switch (actionCategory) {
    case POLICY_ACTION_CATEGORY_MERGE:
      return 'request-merge-approval';
    case POLICY_ACTION_CATEGORY_COMMAND_EXECUTION:
      return 'request-command-approval';
    case POLICY_ACTION_CATEGORY_WORKTREE_RELEASE:
      return 'request-destructive-approval';
    case POLICY_ACTION_CATEGORY_REBASE:
      return 'request-rebase-approval';
    case POLICY_ACTION_CATEGORY_PUBLISH:
      return 'request-publish-approval';
    case POLICY_ACTION_CATEGORY_AUTOFIX:
      return 'request-autofix-approval';
    case POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP:
      return 'request-destructive-approval';
    case POLICY_ACTION_CATEGORY_ROUTINE:
      return 'continue';
  }
}

/** Describes policy decision. */
export function describePolicyDecision(input: PolicyDecision): string {
  return `${input.action} -> ${input.reason}`;
}
