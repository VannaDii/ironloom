import { DEVPLAT_ACTION_RETRY_GATES } from '@vannadii/devplat-core';

import type {
  RemediationPlan,
  RemediationResult,
  RemediationResultSummary,
} from './codec.js';
import {
  REMEDIATION_NEXT_ACTION_APPLY_REMEDIATION,
  REMEDIATION_NEXT_ACTION_REQUEST_APPROVAL,
} from './constants.js';

type RemediationNextAction =
  | typeof REMEDIATION_NEXT_ACTION_APPLY_REMEDIATION
  | typeof REMEDIATION_NEXT_ACTION_REQUEST_APPROVAL
  | typeof DEVPLAT_ACTION_RETRY_GATES;

/**
 * Returns unique non-empty string values after trimming user input.
 */
function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Normalizes one remediation execution result.
 */
export function createRemediationResult(
  input: RemediationResult,
): RemediationResult {
  return {
    ...input,
    action: input.action.trim(),
    detail: input.detail.trim(),
    completedAt: new Date(input.completedAt).toISOString(),
  };
}

/**
 * Normalizes a remediation plan and resolves its next action.
 */
export function createRemediationPlan(input: RemediationPlan): RemediationPlan {
  const findingIds = uniqueTrimmed(input.findingIds);
  const unresolvedFindingIds =
    input.unresolvedFindingIds === undefined
      ? findingIds
      : uniqueTrimmed(input.unresolvedFindingIds);
  const nextAction = resolveRemediationNextAction(
    unresolvedFindingIds,
    input.autofix,
    input.approvalRequired,
  );
  return {
    ...input,
    findingIds,
    actions: uniqueTrimmed(input.actions),
    approvalRequired: input.approvalRequired || !input.autofix,
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(input.results === undefined
      ? {}
      : { results: input.results.map(createRemediationResult) }),
    unresolvedFindingIds,
    nextAction: input.nextAction ?? nextAction,
  };
}

/**
 * Summarizes remediation completion status for downstream artifacts.
 */
export function createRemediationResultSummary(
  input: RemediationPlan,
): RemediationResultSummary {
  const plan = createRemediationPlan(input);
  const results =
    input.results === undefined
      ? []
      : input.results.map(createRemediationResult);
  const unresolvedFindingIds =
    input.unresolvedFindingIds === undefined
      ? plan.findingIds
      : uniqueTrimmed(input.unresolvedFindingIds);
  return {
    planId: plan.planId.trim(),
    successfulActions: uniqueTrimmed(
      results.filter((result) => result.success).map((result) => result.action),
    ),
    failedActions: uniqueTrimmed(
      results
        .filter((result) => !result.success)
        .map((result) => result.action),
    ),
    artifactIds: uniqueTrimmed(
      results.flatMap((result) =>
        result.artifactId === undefined ? [] : [result.artifactId],
      ),
    ),
    unresolvedFindingIds,
    complete:
      unresolvedFindingIds.length === 0 &&
      results.every((result) => result.success),
    updatedAt: plan.updatedAt,
  };
}

/**
 * Resolves the next action implied by remediation state.
 */
function resolveRemediationNextAction(
  unresolvedFindingIds: readonly string[],
  autofix: boolean,
  approvalRequired: boolean,
): RemediationNextAction {
  if (unresolvedFindingIds.length === 0) {
    return DEVPLAT_ACTION_RETRY_GATES;
  }

  if (autofix && !approvalRequired) {
    return REMEDIATION_NEXT_ACTION_APPLY_REMEDIATION;
  }

  return REMEDIATION_NEXT_ACTION_REQUEST_APPROVAL;
}

/**
 * Describes a remediation plan for service responses and audit traces.
 */
export function describeRemediationPlan(input: RemediationPlan): string {
  return `Remediation plan -> ${input.planId}`;
}
