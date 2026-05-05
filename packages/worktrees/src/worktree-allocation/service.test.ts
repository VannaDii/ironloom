import { describe, expect, it } from 'vitest';

import {
  WORKTREE_BLOCKED_BASE_BRANCH_NAME,
  WORKTREE_RELEASE_PATH_MISMATCH_TRACE,
  WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE,
  WORKTREE_SYNC_PATH_MISMATCH_TRACE,
} from './constants.js';
import {
  NodeWorktreeGitRunner,
  WorktreeAllocationService,
  type WorktreeGitRunner,
} from './service.js';
import type { WorktreeGitCommandResult } from './codec.js';

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

type WorktreeServiceInputs =
  | {
      mode: 'allocate';
      taskId: string;
      branchName: string;
    }
  | {
      mode: 'execute';
    }
  | {
      mode: 'sync-release';
    }
  | {
      mode: 'git-flow';
      exitCodes: readonly number[];
    }
  | {
      mode: 'node-runner';
      command: string;
      args: readonly string[];
      cwd: string;
      expectedExitCode: number;
      expectedStderr?: string;
      expectedStdout?: string;
      syntheticError?: unknown;
    }
  | {
      mode: 'sync-failure';
      exitCodes: readonly number[];
      syncMode: 'rebase' | 'fast-forward';
      expectedConflict: boolean;
      expectedTrace: readonly string[];
    }
  | {
      mode: 'archive';
      exitCodes: readonly number[];
    }
  | {
      mode: 'failed-release';
      exitCodes: readonly number[];
    }
  | {
      mode: 'blocked-branch';
      branchName: string;
    }
  | {
      mode: 'path-mismatch';
      operation: 'sync' | 'release';
      expectedTrace: string;
    };

type WorktreeServiceContext = {
  service: WorktreeAllocationService;
  runner?: NodeWorktreeGitRunner;
  commands?: WorktreeGitCommandResult[];
};

type WorktreeServiceCase = {
  name: string;
  inputs: WorktreeServiceInputs;
  mock: (inputs: WorktreeServiceInputs) => WorktreeServiceContext;
  assert: (
    context: WorktreeServiceContext,
    inputs: WorktreeServiceInputs,
  ) => void | Promise<void>;
};

function createServiceContext(
  inputs: WorktreeServiceInputs,
): WorktreeServiceContext {
  if (
    inputs.mode === 'git-flow' ||
    inputs.mode === 'sync-failure' ||
    inputs.mode === 'archive' ||
    inputs.mode === 'failed-release'
  ) {
    const context = createRunner(inputs.exitCodes);
    return {
      service: new WorktreeAllocationService(
        context.runner,
        '/repo',
        '/repo/.worktrees',
      ),
      commands: context.commands,
    };
  }

  if (inputs.mode === 'path-mismatch') {
    const context = createRunner([]);
    return {
      service: new WorktreeAllocationService(
        context.runner,
        '/repo',
        '/repo/.worktrees',
      ),
      commands: context.commands,
    };
  }

  if (inputs.mode === 'node-runner') {
    return {
      service: new WorktreeAllocationService(),
      runner:
        inputs.syntheticError === undefined
          ? new NodeWorktreeGitRunner()
          : new NodeWorktreeGitRunner(async () => {
              throw inputs.syntheticError;
            }),
    };
  }

  return {
    service: new WorktreeAllocationService(),
  };
}

describe('WorktreeAllocationService', () => {
  const cases = [
    {
      name: 'allocates worktrees through the service shell',
      inputs: {
        mode: 'allocate',
        taskId: 'task-1',
        branchName: 'feature/task-1',
      },
      mock: createServiceContext,
      assert: (context, inputs) => {
        if (inputs.mode !== 'allocate') {
          throw new Error('expected allocate inputs');
        }

        const allocation = context.service.allocate(
          inputs.taskId,
          inputs.branchName,
        );

        expect(context.service.explain(allocation)).toContain('feature/task-1');
        expect(allocation.branchSafety?.status).toBe('safe');
      },
    },
    {
      name: 'covers execute for precomputed allocations',
      inputs: {
        mode: 'execute',
      },
      mock: createServiceContext,
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute') {
          throw new Error('expected execute inputs');
        }

        const allocation = context.service.execute({
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
        expect(allocation.branchSafety?.nextAction).toBe('allocate-worktree');
      },
    },
    {
      name: 'syncs and releases worktrees through explicit service helpers',
      inputs: {
        mode: 'sync-release',
      },
      mock: createServiceContext,
      assert: (context, inputs) => {
        if (inputs.mode !== 'sync-release') {
          throw new Error('expected sync-release inputs');
        }

        const allocation = context.service.allocate('task-3', 'feature/task-3');
        const syncResult = context.service.sync(allocation, 'main');
        const releaseResult = context.service.release(allocation, 'delete');

        expect(syncResult.baseBranch).toBe('main');
        expect(syncResult.syncMode).toBe('rebase');
        expect(syncResult.conflictsDetected).toBe(false);
        expect(releaseResult.releaseMode).toBe('delete');
        expect(releaseResult.released).toBe(true);
      },
    },
    {
      name: 'runs real git worktree commands through the injected runner',
      inputs: {
        mode: 'git-flow',
        exitCodes: [0, 0, 0, 0],
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'git-flow' || context.commands === undefined) {
          throw new Error('expected git-flow inputs');
        }

        const allocation = await context.service.allocateOnDisk(
          'task-4',
          'feature/task-4',
          'main',
        );
        const syncResult = await context.service.syncOnDisk(allocation, 'main');
        const releaseResult = await context.service.releaseOnDisk(
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
    {
      name: 'captures Node runner command success',
      inputs: {
        mode: 'node-runner',
        command: process.execPath,
        args: ['-e', 'process.stdout.write("ok")'],
        cwd: process.cwd(),
        expectedExitCode: 0,
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'node-runner' || context.runner === undefined) {
          throw new Error('expected node-runner inputs');
        }

        const result = await context.runner.run(
          inputs.command,
          inputs.args,
          inputs.cwd,
        );

        expect(result.exitCode).toBe(inputs.expectedExitCode);
        expect(result.stdout).toBe('ok');
      },
    },
    {
      name: 'preserves Node runner failed subprocess exit code and streams',
      inputs: {
        mode: 'node-runner',
        command: process.execPath,
        args: [
          '-e',
          'process.stdout.write("out"); process.stderr.write("bad"); process.exit(7)',
        ],
        cwd: process.cwd(),
        expectedExitCode: 7,
        expectedStderr: 'bad',
        expectedStdout: 'out',
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'node-runner' || context.runner === undefined) {
          throw new Error('expected node-runner inputs');
        }

        const result = await context.runner.run(
          inputs.command,
          inputs.args,
          inputs.cwd,
        );

        expect(result.exitCode).toBe(inputs.expectedExitCode);
        expect(result.stdout).toBe(inputs.expectedStdout);
        expect(result.stderr).toBe(inputs.expectedStderr);
      },
    },
    {
      name: 'captures Node runner command failures',
      inputs: {
        mode: 'node-runner',
        command: 'definitely-not-real-devplat-git',
        args: [],
        cwd: process.cwd(),
        expectedExitCode: 1,
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'node-runner' || context.runner === undefined) {
          throw new Error('expected node-runner inputs');
        }

        const result = await context.runner.run(
          inputs.command,
          inputs.args,
          inputs.cwd,
        );

        expect(result.exitCode).toBe(inputs.expectedExitCode);
        expect(result.stderr.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'uses fallback runner metadata when spawning cannot start',
      inputs: {
        mode: 'node-runner',
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        cwd: '/definitely-missing-devplat-worktree-cwd',
        expectedExitCode: 1,
        expectedStdout: '',
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'node-runner' || context.runner === undefined) {
          throw new Error('expected node-runner inputs');
        }

        const result = await context.runner.run(
          inputs.command,
          inputs.args,
          inputs.cwd,
        );

        expect(result.exitCode).toBe(inputs.expectedExitCode);
        expect(result.stdout).toBe(inputs.expectedStdout);
        expect(result.stderr.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'uses fallback runner metadata when error details are absent',
      inputs: {
        mode: 'node-runner',
        command: 'git',
        args: ['status'],
        cwd: process.cwd(),
        expectedExitCode: 1,
        expectedStdout: '',
        syntheticError: new Error('synthetic runner failure'),
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'node-runner' || context.runner === undefined) {
          throw new Error('expected node-runner inputs');
        }

        const result = await context.runner.run(
          inputs.command,
          inputs.args,
          inputs.cwd,
        );

        expect(result.exitCode).toBe(inputs.expectedExitCode);
        expect(result.stdout).toBe(inputs.expectedStdout);
        expect(result.stderr).toContain('synthetic runner failure');
      },
    },
    {
      name: 'ignores malformed runner stream metadata',
      inputs: {
        mode: 'node-runner',
        command: 'git',
        args: ['status'],
        cwd: process.cwd(),
        expectedExitCode: 1,
        expectedStdout: '',
        syntheticError: {
          code: 1,
          stdout: 42,
          stderr: 42,
        },
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'node-runner' || context.runner === undefined) {
          throw new Error('expected node-runner inputs');
        }

        const result = await context.runner.run(
          inputs.command,
          inputs.args,
          inputs.cwd,
        );

        expect(result.exitCode).toBe(inputs.expectedExitCode);
        expect(result.stdout).toBe(inputs.expectedStdout);
        expect(result.stderr).toBe('[object Object]');
      },
    },
    {
      name: 'classifies rebase failures as conflicts',
      inputs: {
        mode: 'sync-failure',
        exitCodes: [0, 1],
        syncMode: 'fast-forward',
        expectedConflict: true,
        expectedTrace: ['git:fetch:ok', 'git:fast-forward:failed'],
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'sync-failure' || context.commands === undefined) {
          throw new Error('expected sync-failure inputs');
        }

        const allocation = context.service.allocate('task-5', 'feature/task-5');
        const result = await context.service.syncOnDisk(
          allocation,
          'main',
          inputs.syncMode,
        );

        expect(result.status).toBe('failed');
        expect(result.conflictsDetected).toBe(inputs.expectedConflict);
        expect(result.trace).toEqual(
          expect.arrayContaining(inputs.expectedTrace),
        );
        expect(context.commands.map((command) => command.args[0])).toEqual([
          'fetch',
          'merge',
        ]);
      },
    },
    {
      name: 'classifies fetch failures separately from conflicts',
      inputs: {
        mode: 'sync-failure',
        exitCodes: [1, 0],
        syncMode: 'rebase',
        expectedConflict: false,
        expectedTrace: ['git:fetch:failed', 'git:rebase:ok'],
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'sync-failure') {
          throw new Error('expected sync-failure inputs');
        }

        const allocation = context.service.allocate('task-6', 'feature/task-6');
        const result = await context.service.syncOnDisk(
          allocation,
          'main',
          inputs.syncMode,
        );

        expect(result.status).toBe('failed');
        expect(result.conflictsDetected).toBe(inputs.expectedConflict);
        expect(result.trace).toEqual(
          expect.arrayContaining(inputs.expectedTrace),
        );
      },
    },
    {
      name: 'archives worktrees with git worktree lock',
      inputs: {
        mode: 'archive',
        exitCodes: [0],
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'archive' || context.commands === undefined) {
          throw new Error('expected archive inputs');
        }

        const allocation = context.service.allocate('task-7', 'feature/task-7');
        const result = await context.service.releaseOnDisk(
          allocation,
          'archive',
        );

        expect(result.released).toBe(true);
        expect(context.commands[0]?.args).toEqual([
          'worktree',
          'lock',
          '--reason',
          'devplat-archive',
          '/repo/.worktrees/feature/task-7',
        ]);
      },
    },
    {
      name: 'marks failed git allocation and release results',
      inputs: {
        mode: 'failed-release',
        exitCodes: [1, 1],
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'failed-release') {
          throw new Error('expected failed-release inputs');
        }

        const allocation = await context.service.allocateOnDisk(
          'task-8',
          'feature/task-8',
          'main',
        );
        const releaseResult = await context.service.releaseOnDisk(
          allocation,
          'delete',
        );

        expect(allocation.status).toBe('failed');
        expect(releaseResult.status).toBe('failed');
        expect(releaseResult.released).toBe(false);
      },
    },
    {
      name: 'blocks unsafe branch names before running git',
      inputs: {
        mode: 'blocked-branch',
        branchName: '../outside',
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'blocked-branch') {
          throw new Error('expected blocked-branch inputs');
        }

        const allocation = await context.service.allocateOnDisk(
          'task-9',
          inputs.branchName,
          'main',
        );
        const syncResult = await context.service.syncOnDisk(allocation, 'main');
        const releaseResult = await context.service.releaseOnDisk(
          allocation,
          'delete',
        );

        expect(allocation.status).toBe('blocked');
        expect(syncResult.status).toBe('blocked');
        expect(releaseResult.released).toBe(false);
        expect(allocation.trace).toContain('git:worktree:add:blocked');
      },
    },
    {
      name: 'blocks on-disk sync when base branch is unsafe',
      inputs: {
        mode: 'path-mismatch',
        operation: 'sync',
        expectedTrace: WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE,
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (
          inputs.mode !== 'path-mismatch' ||
          inputs.operation !== 'sync' ||
          context.commands === undefined
        ) {
          throw new Error('expected base-branch sync inputs');
        }

        const allocation = context.service.allocate(
          'task-unsafe-base',
          'feature/task-unsafe-base',
        );
        const result = await context.service.syncOnDisk(
          allocation,
          '--upload-pack=sh',
        );

        expect(result.status).toBe('blocked');
        expect(result.changed).toBe(false);
        expect(result.baseBranch).toBe(WORKTREE_BLOCKED_BASE_BRANCH_NAME);
        expect(result.trace).toContain(inputs.expectedTrace);
        expect(context.commands).toEqual([]);
      },
    },
    {
      name: 'blocks on-disk sync when allocation path differs from configured root',
      inputs: {
        mode: 'path-mismatch',
        operation: 'sync',
        expectedTrace: WORKTREE_SYNC_PATH_MISMATCH_TRACE,
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (
          inputs.mode !== 'path-mismatch' ||
          inputs.operation !== 'sync' ||
          context.commands === undefined
        ) {
          throw new Error('expected path-mismatch sync inputs');
        }

        const allocation = context.service.allocate(
          'task-10',
          'feature/task-10',
        );
        const result = await context.service.syncOnDisk(
          {
            ...allocation,
            worktreePath: '/repo/untrusted-worktree',
          },
          'main',
        );

        expect(result.status).toBe('blocked');
        expect(result.changed).toBe(false);
        expect(result.trace).toContain(inputs.expectedTrace);
        expect(context.commands).toEqual([]);
      },
    },
    {
      name: 'blocks on-disk release when allocation path differs from configured root',
      inputs: {
        mode: 'path-mismatch',
        operation: 'release',
        expectedTrace: WORKTREE_RELEASE_PATH_MISMATCH_TRACE,
      },
      mock: createServiceContext,
      assert: async (context, inputs) => {
        if (
          inputs.mode !== 'path-mismatch' ||
          inputs.operation !== 'release' ||
          context.commands === undefined
        ) {
          throw new Error('expected path-mismatch release inputs');
        }

        const allocation = context.service.allocate(
          'task-11',
          'feature/task-11',
        );
        const result = await context.service.releaseOnDisk(
          {
            ...allocation,
            worktreePath: '/repo/untrusted-worktree',
          },
          'delete',
        );

        expect(result.status).toBe('blocked');
        expect(result.released).toBe(false);
        expect(result.trace).toContain(inputs.expectedTrace);
        expect(context.commands).toEqual([]);
      },
    },
  ] satisfies WorktreeServiceCase[];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock(testCase.inputs);

    await testCase.assert(context, testCase.inputs);
  });
});
