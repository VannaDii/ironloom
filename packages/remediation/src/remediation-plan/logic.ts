import type {
  RemediationPlan,
  RemediationResult,
  RemediationResultSummary,
} from './types.js';

type RemediationNextAction =
  | 'apply-remediation'
  | 'request-approval'
  | 'retry-gates';

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

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

function resolveRemediationNextAction(
  unresolvedFindingIds: readonly string[],
  autofix: boolean,
  approvalRequired: boolean,
): RemediationNextAction {
  if (unresolvedFindingIds.length === 0) {
    return 'retry-gates';
  }

  if (autofix && !approvalRequired) {
    return 'apply-remediation';
  }

  return 'request-approval';
}

export function describeRemediationPlan(input: RemediationPlan): string {
  return `Remediation plan -> ${input.planId}`;
}
