import { DEVPLAT_ACTION_REBASE_DEPENDENTS } from '@vannadii/devplat-core';

import type {
  BranchConflictClassification,
  BranchDependencyGraph,
  RebaseExecutionResult,
  RebasePlan,
} from './codec.js';
import {
  BRANCH_CONFLICT_NEXT_ACTION_RESOLVE_CONFLICTS,
  BRANCH_CONFLICT_NEXT_ACTION_RUN_REBASE_PREVIEW,
} from './constants.js';

/**
 * Returns unique non-empty branch names after trimming input values.
 */
function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Creates an edge list from one base branch to dependent branches.
 */
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

/**
 * Classifies branch conflicts and resolves the next branch action.
 */
export function classifyBranchConflicts(input: {
  conflictsExpected: boolean;
  affectedBranches: readonly string[];
}): BranchConflictClassification {
  const affectedBranches = uniqueTrimmed(input.affectedBranches);
  if (affectedBranches.length > 0) {
    return {
      kind: 'detected',
      affectedBranches,
      nextAction: BRANCH_CONFLICT_NEXT_ACTION_RESOLVE_CONFLICTS,
    };
  }

  if (input.conflictsExpected) {
    return {
      kind: 'expected',
      affectedBranches,
      nextAction: BRANCH_CONFLICT_NEXT_ACTION_RUN_REBASE_PREVIEW,
    };
  }

  return {
    kind: 'none',
    affectedBranches,
    nextAction: DEVPLAT_ACTION_REBASE_DEPENDENTS,
  };
}

/**
 * Normalizes a dependent-branch rebase plan.
 */
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

/**
 * Describes a dependent-branch rebase plan for operator output.
 */
export function describeRebasePlan(input: RebasePlan): string {
  return `Rebase ${String(input.dependentBranches.length)} dependents from ${input.baseBranch}`;
}

/**
 * Normalizes a dependent-branch rebase execution result.
 */
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
