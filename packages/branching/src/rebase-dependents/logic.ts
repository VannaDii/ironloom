import type {
  BranchConflictClassification,
  BranchDependencyGraph,
  RebaseExecutionResult,
  RebasePlan,
} from './types.js';

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function createBranchDependencyGraph(
  baseBranch: string,
  dependentBranches: readonly string[],
): BranchDependencyGraph {
  const normalizedBase = baseBranch.trim();
  const branches = uniqueTrimmed(dependentBranches);
  return {
    baseBranch: normalizedBase,
    edges: branches.map((branch) => ({
      fromBranch: normalizedBase,
      toBranch: branch,
    })),
  };
}

export function classifyBranchConflicts(input: {
  conflictsExpected: boolean;
  affectedBranches: readonly string[];
}): BranchConflictClassification {
  const affectedBranches = uniqueTrimmed(input.affectedBranches);
  if (affectedBranches.length > 0) {
    return {
      kind: 'detected',
      affectedBranches,
      nextAction: 'resolve-conflicts',
    };
  }

  if (input.conflictsExpected) {
    return {
      kind: 'expected',
      affectedBranches,
      nextAction: 'run-rebase-preview',
    };
  }

  return {
    kind: 'none',
    affectedBranches,
    nextAction: 'rebase-dependents',
  };
}

export function createRebasePlan(input: RebasePlan): RebasePlan {
  const dependentBranches = uniqueTrimmed(input.dependentBranches);
  const baseBranch = input.baseBranch.trim();

  return {
    ...input,
    baseBranch,
    dependentBranches,
    rebaseRequired: input.rebaseRequired || dependentBranches.length > 0,
    updatedAt: new Date(input.updatedAt).toISOString(),
    dependencyGraph:
      input.dependencyGraph ??
      createBranchDependencyGraph(baseBranch, dependentBranches),
    conflictClassification:
      input.conflictClassification ??
      classifyBranchConflicts({
        conflictsExpected: input.conflictsExpected,
        affectedBranches: input.conflictsExpected ? dependentBranches : [],
      }),
  };
}

export function describeRebasePlan(input: RebasePlan): string {
  return `Rebase ${String(input.dependentBranches.length)} dependents from ${input.baseBranch}`;
}

export function createRebaseExecutionResult(
  input: RebaseExecutionResult,
): RebaseExecutionResult {
  return {
    ...input,
    executed: input.executed || input.syncResults.length > 0,
    conflictsDetected:
      input.conflictsDetected ||
      input.syncResults.some((result) => result.conflictsDetected),
  };
}
