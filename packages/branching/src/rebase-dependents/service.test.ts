import { describe, expect, it } from 'vitest';

import type { PullRequestRecord } from '@vannadii/devplat-prs';
import {
  WorktreeAllocationService,
  type WorktreeAllocation,
  type WorktreeSyncMode,
  type WorktreeSyncResult,
} from '@vannadii/devplat-worktrees';

import { BRANCH_CONFLICT_NEXT_ACTION_RESOLVE_CONFLICTS } from './constants.js';
import { RebaseDependentsService } from './service.js';
import type { ExecuteRebaseDependentsInput, RebasePlan } from './codec.js';

/**
 * Worktree service fixture that reports a detected conflict during sync.
 */
class ConflictingWorktreeAllocationService extends WorktreeAllocationService {
  /**
   * Reports a failed sync result for conflict classification tests.
   */
  public override sync(
    allocation: WorktreeAllocation,
    baseBranch: string,
    syncMode: WorktreeSyncMode = 'rebase',
  ): WorktreeSyncResult {
    return {
      id: `${allocation.id}:sync:${syncMode}`,
      summary: `Conflict while syncing ${allocation.branchName}`,
      status: 'failed',
      trace: [...allocation.trace, 'git:rebase:failed'],
      updatedAt: '2026-04-04T00:00:00.000Z',
      taskId: allocation.taskId,
      branchName: allocation.branchName,
      worktreePath: allocation.worktreePath,
      baseBranch,
      syncMode,
      changed: false,
      conflictsDetected: true,
    };
  }
}

type RebaseDependentsServiceInputs =
  | {
      mode: 'create-for-merge';
      record: PullRequestRecord;
      dependentBranches: string[];
    }
  | {
      mode: 'direct';
      plan: RebasePlan;
    }
  | {
      mode: 'execute-for-merge';
      input: ExecuteRebaseDependentsInput;
    };

type RebaseDependentsServiceCase = {
  name: string;
  inputs: RebaseDependentsServiceInputs;
  mock: () => {
    service: RebaseDependentsService;
  };
  assert: (
    context: { service: RebaseDependentsService },
    inputs: RebaseDependentsServiceInputs,
  ) => void;
};

describe('RebaseDependentsService', () => {
  const cases = [
    {
      name: 'creates downstream rebase plans from merged pull requests',
      inputs: {
        mode: 'create-for-merge',
        record: {
          prNumber: 42,
          branchName: 'feature/release-flow',
          baseBranch: 'main',
          title: 'Release workflow hardening',
          labels: ['release'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        dependentBranches: ['feature/a', 'feature/b'],
      },
      mock: () => ({
        service: new RebaseDependentsService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'create-for-merge') {
          throw new Error('expected create-for-merge inputs');
        }

        const snapshot = context.service.createForMerge(
          inputs.record,
          inputs.dependentBranches,
        );

        expect(snapshot.mergedPrNumber).toBe(42);
        expect(snapshot.rebaseRequired).toBe(true);
        expect(context.service.explain(snapshot)).toContain('2 dependents');
      },
    },
    {
      name: 'covers direct create and execute helpers',
      inputs: {
        mode: 'direct',
        plan: {
          mergedPrNumber: 8,
          baseBranch: ' main ',
          dependentBranches: [],
          rebaseRequired: false,
          conflictsExpected: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new RebaseDependentsService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'direct') {
          throw new Error('expected direct inputs');
        }

        const created = context.service.create(inputs.plan);
        const executed = context.service.execute(created);

        expect(created.baseBranch).toBe('main');
        expect(executed.rebaseRequired).toBe(false);
        expect(context.service.explain(executed)).toContain('0 dependents');
      },
    },
    {
      name: 'executes dependent rebases through worktree sync orchestration',
      inputs: {
        mode: 'execute-for-merge',
        input: {
          record: {
            prNumber: 42,
            branchName: 'feature/release-flow',
            baseBranch: 'main',
            title: 'Release workflow hardening',
            labels: ['release'],
            reviewState: 'approved',
            mergeReady: true,
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
          dependentBranches: ['feature/a'],
        },
      },
      mock: () => ({
        service: new RebaseDependentsService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute-for-merge') {
          throw new Error('expected execute-for-merge inputs');
        }

        const snapshot = context.service.executeForMerge(inputs.input);

        expect(snapshot).toMatchObject({
          plan: {
            mergedPrNumber: 42,
            dependentBranches: ['feature/a'],
          },
          syncMode: 'rebase',
          executed: true,
          syncResults: [
            {
              branchName: 'feature/a',
              baseBranch: 'main',
            },
          ],
        });
      },
    },
    {
      name: 'classifies dependent rebase conflicts from sync results',
      inputs: {
        mode: 'execute-for-merge',
        input: {
          record: {
            prNumber: 43,
            branchName: 'feature/base-change',
            baseBranch: 'main',
            title: 'Base branch merge',
            labels: ['branching'],
            reviewState: 'approved',
            mergeReady: true,
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
          dependentBranches: ['feature/a'],
          syncMode: 'rebase',
        },
      },
      mock: () => ({
        service: new RebaseDependentsService(
          new ConflictingWorktreeAllocationService(),
        ),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute-for-merge') {
          throw new Error('expected execute-for-merge inputs');
        }

        const snapshot = context.service.executeForMerge(inputs.input);

        expect(snapshot.conflictsDetected).toBe(true);
        expect(snapshot.plan.conflictClassification).toEqual({
          kind: 'detected',
          affectedBranches: ['feature/a'],
          nextAction: BRANCH_CONFLICT_NEXT_ACTION_RESOLVE_CONFLICTS,
        });
      },
    },
  ] satisfies RebaseDependentsServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
