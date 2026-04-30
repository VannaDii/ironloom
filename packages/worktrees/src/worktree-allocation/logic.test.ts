import { describe, expect, it } from 'vitest';

import { allocateWorktree, createWorktreeAllocation } from './logic.js';

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
        expect(allocation.trace).toContain('worktree:task-2:feature/task-2');
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
