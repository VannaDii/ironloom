import { describe, expect, it } from 'vitest';

import {
  NodeWorktreeGitRunner,
  WorktreeAllocationService,
  type WorktreeGitRunner,
} from './service.js';
import type { WorktreeGitCommandResult } from './types.js';

function createRunner(exitCodes: readonly number[]): {
  runner: WorktreeGitRunner;
  commands: WorktreeGitCommandResult[];
} {
  const commands: WorktreeGitCommandResult[] = [];
  let index = 0;
  return {
    commands,
    runner: {
      async run(command, args, cwd) {
        const exitCode = exitCodes[index] ?? 0;
        index += 1;
        const result = {
          command,
          args: [...args],
          cwd,
          exitCode,
          stdout: '',
          stderr: exitCode === 0 ? '' : 'failed',
        };
        commands.push(result);
        return result;
      },
    },
  };
}

describe('WorktreeAllocationService', () => {
  it('allocates worktrees through the service shell', () => {
    const service = new WorktreeAllocationService();
    const allocation = service.allocate('task-1', 'feature/task-1');
    expect(service.explain(allocation)).toContain('feature/task-1');
  });

  it('covers execute for precomputed allocations', () => {
    const service = new WorktreeAllocationService();
    const allocation = service.execute({
      id: 'worktree-task-2',
      summary: '  allocated worktree  ',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      taskId: 'task-2',
      branchName: 'feature/task-2',
      worktreePath: '.worktrees/feature/task-2',
    });

    expect(allocation.summary).toBe('allocated worktree');
  });

  it('syncs and releases worktrees through explicit service helpers', () => {
    const service = new WorktreeAllocationService();
    const allocation = service.allocate('task-3', 'feature/task-3');
    const syncResult = service.sync(allocation, 'main');
    const releaseResult = service.release(allocation, 'delete');

    expect(syncResult.baseBranch).toBe('main');
    expect(syncResult.syncMode).toBe('rebase');
    expect(syncResult.conflictsDetected).toBe(false);
    expect(releaseResult.releaseMode).toBe('delete');
    expect(releaseResult.released).toBe(true);
  });

  it('runs real git worktree commands through the injected runner', async () => {
    const cases = [
      {
        inputs: {
          exitCodes: [0, 0, 0, 0],
        },
        mock: () => createRunner([0, 0, 0, 0]),
        assert: async (context: ReturnType<typeof createRunner>) => {
          const service = new WorktreeAllocationService(
            context.runner,
            '/repo',
            '/repo/.worktrees',
          );
          const allocation = await service.allocateOnDisk(
            'task-4',
            'feature/task-4',
            'main',
          );
          const syncResult = await service.syncOnDisk(allocation, 'main');
          const releaseResult = await service.releaseOnDisk(
            allocation,
            'delete',
          );

          expect(allocation.status).toBe('approved');
          expect(syncResult.status).toBe('complete');
          expect(releaseResult.released).toBe(true);
          expect(context.commands.map((command) => command.args[0])).toEqual([
            'worktree',
            'fetch',
            'rebase',
            'worktree',
          ]);
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context);
    }
  });

  it('captures Node runner command success and failures', async () => {
    const cases = [
      {
        inputs: {
          command: process.execPath,
          args: ['-e', 'process.stdout.write("ok")'],
          cwd: process.cwd(),
        },
        mock: () => new NodeWorktreeGitRunner(),
        assert: async (runner: NodeWorktreeGitRunner) => {
          const result = await runner.run(
            cases[0].inputs.command,
            cases[0].inputs.args,
            cases[0].inputs.cwd,
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toBe('ok');
        },
      },
      {
        inputs: {
          command: 'definitely-not-real-devplat-git',
          args: [],
          cwd: process.cwd(),
        },
        mock: () => new NodeWorktreeGitRunner(),
        assert: async (runner: NodeWorktreeGitRunner) => {
          const result = await runner.run(
            cases[1].inputs.command,
            cases[1].inputs.args,
            cases[1].inputs.cwd,
          );

          expect(result.exitCode).toBe(1);
          expect(result.stderr.length).toBeGreaterThan(0);
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock());
    }
  });

  it('classifies git sync failures as conflicts', async () => {
    const cases = [
      {
        inputs: {
          exitCodes: [0, 1],
        },
        mock: () => createRunner([0, 1]),
        assert: async (context: ReturnType<typeof createRunner>) => {
          const service = new WorktreeAllocationService(
            context.runner,
            '/repo',
            '/repo/.worktrees',
          );
          const allocation = service.allocate('task-5', 'feature/task-5');
          const result = await service.syncOnDisk(
            allocation,
            'main',
            'fast-forward',
          );

          expect(result.status).toBe('failed');
          expect(result.conflictsDetected).toBe(true);
          expect(context.commands.map((command) => command.args[0])).toEqual([
            'fetch',
            'merge',
          ]);
        },
      },
      {
        inputs: {
          exitCodes: [1, 0],
        },
        mock: () => createRunner([1, 0]),
        assert: async (context: ReturnType<typeof createRunner>) => {
          const service = new WorktreeAllocationService(
            context.runner,
            '/repo',
            '/repo/.worktrees',
          );
          const allocation = service.allocate('task-6', 'feature/task-6');
          const result = await service.syncOnDisk(allocation, 'main', 'rebase');

          expect(result.status).toBe('failed');
          expect(result.conflictsDetected).toBe(false);
          expect(result.trace).toContain('git:fetch:failed');
          expect(result.trace).toContain('git:rebase:ok');
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context);
    }
  });

  it('archives worktrees with git worktree lock', async () => {
    const cases = [
      {
        inputs: {
          exitCodes: [0],
        },
        mock: () => createRunner([0]),
        assert: async (context: ReturnType<typeof createRunner>) => {
          const service = new WorktreeAllocationService(
            context.runner,
            '/repo',
            '/repo/.worktrees',
          );
          const allocation = service.allocate('task-6', 'feature/task-6');
          const result = await service.releaseOnDisk(allocation, 'archive');

          expect(result.released).toBe(true);
          expect(context.commands[0]?.args).toEqual([
            'worktree',
            'lock',
            '--reason',
            'devplat-archive',
            '.worktrees/feature/task-6',
          ]);
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context);
    }
  });

  it('marks failed git allocation and release results', async () => {
    const cases = [
      {
        inputs: {
          exitCodes: [1, 1],
        },
        mock: () => createRunner([1, 1]),
        assert: async (context: ReturnType<typeof createRunner>) => {
          const service = new WorktreeAllocationService(
            context.runner,
            '/repo',
            '/repo/.worktrees',
          );
          const allocation = await service.allocateOnDisk(
            'task-7',
            'feature/task-7',
            'main',
          );
          const releaseResult = await service.releaseOnDisk(
            allocation,
            'delete',
          );

          expect(allocation.status).toBe('failed');
          expect(releaseResult.status).toBe('failed');
          expect(releaseResult.released).toBe(false);
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context);
    }
  });
});
