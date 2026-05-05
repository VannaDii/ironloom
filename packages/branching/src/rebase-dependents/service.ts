import type { PullRequestRecord } from '@vannadii/devplat-prs';
import {
  WorktreeAllocationService,
  type WorktreeSyncResult,
} from '@vannadii/devplat-worktrees';

import {
  classifyBranchConflicts,
  createRebaseExecutionResult,
  createRebasePlan,
  describeRebasePlan,
} from './logic.js';
import type {
  ExecuteRebaseDependentsInput,
  RebaseExecutionResult,
  RebasePlan,
} from './codec.js';

/**
 * Collects branches whose dependent worktree sync reported conflicts.
 */
function findConflictedBranches(
  syncResults: readonly WorktreeSyncResult[],
): string[] {
  return syncResults
    .filter((result) => result.conflictsDetected)
    .map((result) => result.branchName);
}

export class RebaseDependentsService {
  /**
   * Creates the rebase service with the worktree allocator used for dependents.
   */
  public constructor(
    private readonly worktrees = new WorktreeAllocationService(),
  ) {}

  /**
   * Normalizes a dependent-branch rebase plan.
   */
  public create(input: RebasePlan): RebasePlan {
    return createRebasePlan(input);
  }

  /**
   * Executes pure rebase-plan normalization.
   */
  public execute(input: RebasePlan): RebasePlan {
    return this.create(input);
  }

  /**
   * Creates a dependent-branch plan from a merged pull request.
   */
  public createForMerge(
    input: PullRequestRecord,
    dependentBranches: readonly string[],
  ): RebasePlan {
    return createRebasePlan({
      mergedPrNumber: input.prNumber,
      baseBranch: input.baseBranch,
      dependentBranches: [...dependentBranches],
      rebaseRequired: dependentBranches.length > 0,
      conflictsExpected: false,
      updatedAt: input.updatedAt,
    });
  }

  /**
   * Executes dependent branch sync planning and conflict classification.
   */
  public executeForMerge(
    input: ExecuteRebaseDependentsInput,
  ): RebaseExecutionResult {
    const plan = this.createForMerge(input.record, input.dependentBranches);
    const syncMode = input.syncMode ?? 'rebase';
    const syncResults = plan.dependentBranches.map((branchName, index) => {
      const allocation = this.worktrees.allocate(
        `pr-${String(input.record.prNumber)}-dependent-${String(index + 1)}`,
        branchName,
      );
      return this.worktrees.sync(allocation, plan.baseBranch, syncMode);
    });
    const conflictClassification = classifyBranchConflicts({
      conflictsExpected: plan.conflictsExpected,
      affectedBranches: findConflictedBranches(syncResults),
    });

    return createRebaseExecutionResult({
      plan: {
        ...plan,
        conflictClassification,
      },
      syncMode,
      syncResults,
      executed: false,
      conflictsDetected: false,
    });
  }

  /**
   * Describes the dependent-branch rebase plan for operator output.
   */
  public explain(input: RebasePlan): string {
    return describeRebasePlan(input);
  }
}
