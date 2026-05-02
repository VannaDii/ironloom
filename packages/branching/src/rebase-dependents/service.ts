import type { PullRequestRecord } from '@vannadii/devplat-prs';
import { WorktreeAllocationService } from '@vannadii/devplat-worktrees';

import {
  createRebaseExecutionResult,
  createRebasePlan,
  describeRebasePlan,
} from './logic.js';
import type {
  ExecuteRebaseDependentsInput,
  RebaseExecutionResult,
  RebasePlan,
} from './codec.js';

export class RebaseDependentsService {
  /**
   * Creates the rebase service with the worktree allocator used for dependents.
   */
  public constructor(
    private readonly worktrees = new WorktreeAllocationService(),
  ) {}

  public create(input: RebasePlan): RebasePlan {
    return createRebasePlan(input);
  }

  public execute(input: RebasePlan): RebasePlan {
    return this.create(input);
  }

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

    return createRebaseExecutionResult({
      plan,
      syncMode,
      syncResults,
      executed: false,
      conflictsDetected: false,
    });
  }

  public explain(input: RebasePlan): string {
    return describeRebasePlan(input);
  }
}
