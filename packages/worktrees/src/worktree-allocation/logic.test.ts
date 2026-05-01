import { describe, expect, it } from 'vitest';

import {
  allocateWorktree,
  createWorktreeAllocation,
  evaluateWorktreeBranchSafety,
  syncWorktree,
} from './logic.js';

describe('WorktreeAllocation logic', () => {
  const cases = [
    {
      name: 'allocates a deterministic worktree path',
      inputs: {
        taskId: 'task-1',
        branchName: 'feature/task-1',
      },
      mock: () => undefined,
      assert: (inputs: { taskId: string; branchName: string }) => {
        const allocation = allocateWorktree(inputs.taskId, inputs.branchName);

        expect(allocation.worktreePath).toContain('feature/task-1');
        expect(allocation.branchSafety?.status).toBe('safe');
        expect(allocation.trace).toContain('worktree:task-1:feature/task-1');
      },
    },
    {
      name: 'trims worktree identity fields before building trace markers',
      inputs: {
        allocation: {
          id: 'worktree-task-2',
          summary: '  allocated worktree  ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          taskId: '  task-2  ',
          branchName: '  feature/task-2  ',
          worktreePath: '  .worktrees/feature/task-2  ',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        allocation: Parameters<typeof createWorktreeAllocation>[0];
      }) => {
        const allocation = createWorktreeAllocation(inputs.allocation);

        expect(allocation.taskId).toBe('task-2');
        expect(allocation.branchName).toBe('feature/task-2');
        expect(allocation.worktreePath).toBe('.worktrees/feature/task-2');
        expect(allocation.branchSafety?.nextAction).toBe('allocate-worktree');
        expect(allocation.trace).toContain('worktree:task-2:feature/task-2');
      },
    },
    {
      name: 'blocks unsafe branch names before deriving a worktree path',
      inputs: {
        taskId: 'task-3',
        branchName: '../outside',
      },
      mock: () => undefined,
      assert: (inputs: { taskId: string; branchName: string }) => {
        const allocation = allocateWorktree(inputs.taskId, inputs.branchName);
        const syncResult = syncWorktree(allocation, 'main');

        expect(allocation.status).toBe('blocked');
        expect(allocation.worktreePath).toBe('.worktrees/blocked/task-3');
        expect(allocation.branchSafety).toEqual({
          status: 'blocked',
          branchName: '../outside',
          normalizedBranchName: '../outside',
          reason: 'Branch name must not contain parent-directory segments.',
          nextAction: 'choose-a-safe-branch-name',
        });
        expect(syncResult.status).toBe('blocked');
        expect(syncResult.changed).toBe(false);
      },
    },
    {
      name: 'classifies git-ref safety reasons',
      inputs: {
        checks: [
          ['feature/task', 'safe'],
          [' feature/task ', 'safe'],
          ['', 'Branch name must not be empty.'],
          ['@', 'Branch name must not be a bare @ ref.'],
          ['-dash', 'Branch name must not start with a dash.'],
          ['/absolute', 'Branch name must not start or end with a slash.'],
          ['trailing/', 'Branch name must not start or end with a slash.'],
          [
            'feature//task',
            'Branch name must not contain empty path segments.',
          ],
          [
            'feature..task',
            'Branch name must not contain parent-directory segments.',
          ],
          ['feature@{1}', 'Branch name must not contain git reflog syntax.'],
          ['feature.', 'Branch name must not end with a dot.'],
          ['.feature/task', 'Branch path segments must not start with a dot.'],
          [
            'feature.lock/task',
            'Branch path segments must not end with .lock.',
          ],
          [
            'feature/task.lock',
            'Branch path segments must not end with .lock.',
          ],
          [
            'feature task',
            'Branch name contains characters that are unsafe for git refs.',
          ],
          [
            'feature~task',
            'Branch name contains characters that are unsafe for git refs.',
          ],
        ],
      },
      mock: () => undefined,
      assert: (inputs: { checks: string[][] }) => {
        const results = inputs.checks.map(([branchName]) =>
          evaluateWorktreeBranchSafety(branchName ?? ''),
        );

        expect(results.map((result) => result.status)).toEqual([
          'safe',
          'safe',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
          'blocked',
        ]);
        expect(results.map((result) => result.reason)).toEqual([
          'Branch name is safe for git worktree operations.',
          'Branch name is safe for git worktree operations.',
          ...inputs.checks.slice(2).map((check) => check[1] ?? ''),
        ]);
        expect(results[1]?.normalizedBranchName).toBe('feature/task');
      },
    },
    {
      name: 're-roots blocked precomputed allocation paths safely',
      inputs: {
        allocations: [
          {
            id: 'worktree-task-4',
            summary: 'blocked worktree',
            status: 'approved',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            taskId: 'task-4',
            branchName: '../outside',
            worktreePath: '.worktrees/../outside',
          },
          {
            id: 'worktree-task-5',
            summary: 'blocked worktree',
            status: 'approved',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            taskId: 'task-5',
            branchName: '../outside',
            worktreePath: '.worktrees/blocked/task-5',
          },
          {
            id: 'worktree-task-6',
            summary: 'blocked worktree',
            status: 'approved',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            taskId: 'task-6',
            branchName: '@',
            worktreePath: '.worktrees/custom-root',
          },
        ],
      },
      mock: () => undefined,
      assert: (inputs: {
        allocations: Parameters<typeof createWorktreeAllocation>[0][];
      }) => {
        const results = inputs.allocations.map((allocation) =>
          createWorktreeAllocation(allocation),
        );

        expect(results.map((result) => result.worktreePath)).toEqual([
          '.worktrees/blocked/task-4',
          '.worktrees/blocked/task-5',
          '.worktrees/custom-root/blocked/task-6',
        ]);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  }
});
