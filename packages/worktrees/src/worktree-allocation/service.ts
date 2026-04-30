import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  allocateWorktree,
  createWorktreeAllocation,
  createWorktreeReleaseResult,
  createWorktreeSyncResult,
  describeWorktreeAllocation,
  releaseWorktree,
  syncWorktree,
} from './logic.js';
import type {
  WorktreeAllocation,
  WorktreeReleaseMode,
  WorktreeReleaseResult,
  WorktreeGitCommandResult,
  WorktreeSyncMode,
  WorktreeSyncResult,
} from './types.js';

const execFileAsync = promisify(execFile);

export interface WorktreeGitRunner {
  run(
    command: string,
    args: readonly string[],
    cwd: string,
  ): Promise<WorktreeGitCommandResult>;
}

export class NodeWorktreeGitRunner implements WorktreeGitRunner {
  public async run(
    command: string,
    args: readonly string[],
    cwd: string,
  ): Promise<WorktreeGitCommandResult> {
    try {
      const result = await execFileAsync(command, [...args], { cwd });
      return {
        command,
        args: [...args],
        cwd,
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      return {
        command,
        args: [...args],
        cwd,
        exitCode: 1,
        stdout: '',
        stderr: String(error),
      };
    }
  }
}

export class WorktreeAllocationService {
  public constructor(
    private readonly runner: WorktreeGitRunner = new NodeWorktreeGitRunner(),
    private readonly repositoryRoot = process.cwd(),
    private readonly worktreeRoot = '.worktrees',
  ) {}

  public execute(input: WorktreeAllocation): WorktreeAllocation {
    return createWorktreeAllocation(input);
  }

  public explain(input: WorktreeAllocation): string {
    return describeWorktreeAllocation(input);
  }

  public allocate(taskId: string, branchName: string): WorktreeAllocation {
    return allocateWorktree(taskId, branchName);
  }

  public async allocateOnDisk(
    taskId: string,
    branchName: string,
    baseBranch = 'main',
  ): Promise<WorktreeAllocation> {
    const allocation = allocateWorktree(taskId, branchName, this.worktreeRoot);
    const result = await this.runner.run(
      'git',
      [
        'worktree',
        'add',
        '-B',
        allocation.branchName,
        allocation.worktreePath,
        baseBranch,
      ],
      this.repositoryRoot,
    );

    return createWorktreeAllocation({
      ...allocation,
      status: result.exitCode === 0 ? 'approved' : 'failed',
      trace: [
        ...allocation.trace,
        `git:${result.command}:${result.exitCode === 0 ? 'ok' : 'failed'}`,
      ],
    });
  }

  public sync(
    allocation: WorktreeAllocation,
    baseBranch: string,
    syncMode?: WorktreeSyncMode,
  ): WorktreeSyncResult {
    return syncWorktree(allocation, baseBranch, syncMode);
  }

  public async syncOnDisk(
    allocation: WorktreeAllocation,
    baseBranch: string,
    syncMode: WorktreeSyncMode = 'rebase',
  ): Promise<WorktreeSyncResult> {
    const normalized = createWorktreeAllocation(allocation);
    const fetchResult = await this.runner.run(
      'git',
      ['fetch', 'origin', baseBranch],
      this.repositoryRoot,
    );
    const syncArgs =
      syncMode === 'rebase'
        ? ['rebase', `origin/${baseBranch}`]
        : ['merge', '--ff-only', `origin/${baseBranch}`];
    const syncResult = await this.runner.run(
      'git',
      syncArgs,
      normalized.worktreePath,
    );
    const succeeded = fetchResult.exitCode === 0 && syncResult.exitCode === 0;

    return createWorktreeSyncResult({
      id: `${normalized.id}:sync:${syncMode}`,
      summary: `Synced worktree for ${normalized.branchName}`,
      status: succeeded ? 'complete' : 'failed',
      trace: [
        ...normalized.trace,
        `git:fetch:${fetchResult.exitCode === 0 ? 'ok' : 'failed'}`,
        `git:${syncMode}:${syncResult.exitCode === 0 ? 'ok' : 'failed'}`,
      ],
      updatedAt: new Date().toISOString(),
      taskId: normalized.taskId,
      branchName: normalized.branchName,
      worktreePath: normalized.worktreePath,
      baseBranch,
      syncMode,
      changed: succeeded,
      conflictsDetected: syncResult.exitCode !== 0,
    });
  }

  public release(
    allocation: WorktreeAllocation,
    releaseMode?: WorktreeReleaseMode,
  ): WorktreeReleaseResult {
    return releaseWorktree(allocation, releaseMode);
  }

  public async releaseOnDisk(
    allocation: WorktreeAllocation,
    releaseMode: WorktreeReleaseMode = 'archive',
  ): Promise<WorktreeReleaseResult> {
    const normalized = createWorktreeAllocation(allocation);
    const result =
      releaseMode === 'delete'
        ? await this.runner.run(
            'git',
            ['worktree', 'remove', '--force', normalized.worktreePath],
            this.repositoryRoot,
          )
        : await this.runner.run(
            'git',
            [
              'worktree',
              'lock',
              '--reason',
              'devplat-archive',
              normalized.worktreePath,
            ],
            this.repositoryRoot,
          );

    return createWorktreeReleaseResult({
      id: `${normalized.id}:release:${releaseMode}`,
      summary: `Released worktree for ${normalized.branchName}`,
      status: result.exitCode === 0 ? 'complete' : 'failed',
      trace: [
        ...normalized.trace,
        `git:release:${result.exitCode === 0 ? 'ok' : 'failed'}`,
      ],
      updatedAt: new Date().toISOString(),
      taskId: normalized.taskId,
      branchName: normalized.branchName,
      worktreePath: normalized.worktreePath,
      releaseMode,
      released: result.exitCode === 0,
    });
  }
}
