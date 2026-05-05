import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  allocateWorktree,
  createWorktreeAllocation,
  createWorktreeReleaseResult,
  createWorktreeSyncResult,
  describeWorktreeAllocation,
  evaluateWorktreeBranchSafety,
  releaseWorktree,
  syncWorktree,
} from './logic.js';
import {
  WORKTREE_DEFAULT_ROOT,
  WORKTREE_GIT_RUNNER_GENERIC_FAILURE_EXIT_CODE,
  WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE,
  WORKTREE_RELEASE_PATH_MISMATCH_TRACE,
  WORKTREE_SYNC_PATH_MISMATCH_TRACE,
} from './constants.js';
import type {
  WorktreeAllocation,
  WorktreeReleaseMode,
  WorktreeReleaseResult,
  WorktreeGitCommandResult,
  WorktreeSyncMode,
  WorktreeSyncResult,
} from './codec.js';

/** Codec for exec file async. */
const execFileAsync = promisify(execFile);

/**
 * Result returned by the Node child-process execution adapter.
 */
type NodeWorktreeExecFileResult = {
  /** Captured stdout text. */
  stdout: string;
  /** Captured stderr text. */
  stderr: string;
};

/**
 * Node child-process execution adapter used by the git runner.
 */
type NodeWorktreeExecFile = (
  command: string,
  args: readonly string[],
  options: { cwd: string },
) => Promise<NodeWorktreeExecFileResult>;

/**
 * Runs a child process using Node's `execFile` API.
 */
async function runNodeExecFile(
  command: string,
  args: readonly string[],
  options: { cwd: string },
): Promise<NodeWorktreeExecFileResult> {
  const result = await execFileAsync(command, [...args], options);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Reads the child-process exit code from a Node exec failure.
 */
function readProcessExitCode(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const exitCode = error.code;
    if (typeof exitCode === 'number') {
      return exitCode;
    }
  }

  return WORKTREE_GIT_RUNNER_GENERIC_FAILURE_EXIT_CODE;
}

/**
 * Reads captured stdout from a Node exec failure.
 */
function readProcessStdout(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stdout' in error) {
    const output = error.stdout;
    return typeof output === 'string' ? output : undefined;
  }

  return undefined;
}

/**
 * Reads captured stderr from a Node exec failure.
 */
function readProcessStderr(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const output = error.stderr;
    return typeof output === 'string' ? output : undefined;
  }

  return undefined;
}

/**
 * Creates stderr text for runner failures that did not expose captured stderr.
 */
function readProcessErrorText(error: unknown): string {
  const stderr = readProcessStderr(error);
  return stderr === undefined || stderr.length === 0 ? String(error) : stderr;
}

/**
 * Resolves a configured or caller-provided worktree path for equivalence checks.
 */
function resolveWorktreePath(
  repositoryRoot: string,
  worktreePath: string,
): string {
  return resolve(repositoryRoot, worktreePath);
}

/**
 * Returns whether a caller allocation still points at the configured path.
 */
function allocationPathMatchesConfiguredRoot(input: {
  allocation: WorktreeAllocation;
  expected: WorktreeAllocation;
  repositoryRoot: string;
}): boolean {
  return (
    resolveWorktreePath(input.repositoryRoot, input.allocation.worktreePath) ===
    resolveWorktreePath(input.repositoryRoot, input.expected.worktreePath)
  );
}

/**
 * Git command execution boundary for worktree operations.
 */
export interface WorktreeGitRunner {
  /**
   * Runs a git command in the provided working directory.
   */
  run(
    command: string,
    args: readonly string[],
    cwd: string,
  ): Promise<WorktreeGitCommandResult>;
}

/**
 * Node child-process backed git command runner.
 */
export class NodeWorktreeGitRunner implements WorktreeGitRunner {
  /**
   * Creates the Node-backed runner with an injectable execution adapter.
   */
  public constructor(
    private readonly execFileImpl: NodeWorktreeExecFile = runNodeExecFile,
  ) {}

  /**
   * Runs the command and preserves child-process exit and stream metadata.
   */
  public async run(
    command: string,
    args: readonly string[],
    cwd: string,
  ): Promise<WorktreeGitCommandResult> {
    try {
      const result = await this.execFileImpl(command, args, { cwd });
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
        exitCode: readProcessExitCode(error),
        stdout: readProcessStdout(error) ?? '',
        stderr: readProcessErrorText(error),
      };
    }
  }
}

/**
 * Worktree allocation, synchronization, and release service boundary.
 */
export class WorktreeAllocationService {
  /**
   * Creates the worktree service with injected git runner and root paths.
   */
  public constructor(
    private readonly runner: WorktreeGitRunner = new NodeWorktreeGitRunner(),
    private readonly repositoryRoot = process.cwd(),
    private readonly worktreeRoot = WORKTREE_DEFAULT_ROOT,
  ) {}

  /**
   * Normalizes a precomputed worktree allocation record.
   */
  public execute(input: WorktreeAllocation): WorktreeAllocation {
    return createWorktreeAllocation(input);
  }

  /**
   * Describes a worktree allocation for operator output.
   */
  public explain(input: WorktreeAllocation): string {
    return describeWorktreeAllocation(input);
  }

  /**
   * Allocates a deterministic worktree record without touching disk.
   */
  public allocate(taskId: string, branchName: string): WorktreeAllocation {
    return allocateWorktree(taskId, branchName, this.worktreeRoot);
  }

  /**
   * Allocates a git worktree on disk unless branch safety blocks it.
   */
  public async allocateOnDisk(
    taskId: string,
    branchName: string,
    baseBranch = 'main',
  ): Promise<WorktreeAllocation> {
    const allocation = allocateWorktree(taskId, branchName, this.worktreeRoot);
    if (allocation.branchSafety?.status === 'blocked') {
      return createWorktreeAllocation({
        ...allocation,
        trace: [...allocation.trace, 'git:worktree:add:blocked'],
      });
    }

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

  /**
   * Computes a worktree sync result without touching disk.
   */
  public sync(
    allocation: WorktreeAllocation,
    baseBranch: string,
    syncMode?: WorktreeSyncMode,
  ): WorktreeSyncResult {
    return syncWorktree(allocation, baseBranch, syncMode);
  }

  /**
   * Synchronizes an allocated worktree on disk with a base branch.
   */
  public async syncOnDisk(
    allocation: WorktreeAllocation,
    baseBranch: string,
    syncMode: WorktreeSyncMode = 'rebase',
  ): Promise<WorktreeSyncResult> {
    const normalized = createWorktreeAllocation(allocation);
    const expected = allocateWorktree(
      normalized.taskId,
      normalized.branchName,
      this.worktreeRoot,
    );
    const validatedBaseBranch = createWorktreeSyncResult({
      id: `${normalized.id}:sync:${syncMode}`,
      summary: `Validated worktree sync base for ${normalized.branchName}`,
      status: 'queued',
      trace: [],
      updatedAt: new Date().toISOString(),
      taskId: normalized.taskId,
      branchName: normalized.branchName,
      worktreePath: normalized.worktreePath,
      baseBranch,
      syncMode,
      changed: false,
      conflictsDetected: false,
    });
    if (
      validatedBaseBranch.trace.includes(
        WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE,
      )
    ) {
      return createWorktreeSyncResult({
        ...validatedBaseBranch,
        summary: `Blocked worktree sync for ${normalized.branchName}`,
        trace: [...normalized.trace, WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE],
      });
    }

    if (normalized.branchSafety?.status === 'blocked') {
      return createWorktreeSyncResult({
        id: `${normalized.id}:sync:${syncMode}`,
        summary: `Blocked worktree sync for ${normalized.branchName}`,
        status: 'blocked',
        trace: [...normalized.trace, 'git:sync:blocked'],
        updatedAt: new Date().toISOString(),
        taskId: normalized.taskId,
        branchName: normalized.branchName,
        worktreePath: normalized.worktreePath,
        baseBranch: validatedBaseBranch.baseBranch,
        syncMode,
        changed: false,
        conflictsDetected: false,
        branchSafety: normalized.branchSafety,
      });
    }

    if (
      !allocationPathMatchesConfiguredRoot({
        allocation: normalized,
        expected,
        repositoryRoot: this.repositoryRoot,
      })
    ) {
      return createWorktreeSyncResult({
        id: `${normalized.id}:sync:${syncMode}`,
        summary: `Blocked worktree sync for ${normalized.branchName}`,
        status: 'blocked',
        trace: [...normalized.trace, WORKTREE_SYNC_PATH_MISMATCH_TRACE],
        updatedAt: new Date().toISOString(),
        taskId: normalized.taskId,
        branchName: normalized.branchName,
        worktreePath: normalized.worktreePath,
        baseBranch: validatedBaseBranch.baseBranch,
        syncMode,
        changed: false,
        conflictsDetected: false,
        branchSafety: evaluateWorktreeBranchSafety(normalized.branchName),
      });
    }

    const fetchResult = await this.runner.run(
      'git',
      ['fetch', 'origin', validatedBaseBranch.baseBranch],
      this.repositoryRoot,
    );
    const syncArgs =
      syncMode === 'rebase'
        ? ['rebase', `origin/${validatedBaseBranch.baseBranch}`]
        : ['merge', '--ff-only', `origin/${validatedBaseBranch.baseBranch}`];
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
      baseBranch: validatedBaseBranch.baseBranch,
      syncMode,
      changed: succeeded,
      conflictsDetected: syncResult.exitCode !== 0,
    });
  }

  /**
   * Computes a worktree release result without touching disk.
   */
  public release(
    allocation: WorktreeAllocation,
    releaseMode?: WorktreeReleaseMode,
  ): WorktreeReleaseResult {
    return releaseWorktree(allocation, releaseMode);
  }

  /**
   * Releases a worktree on disk by archiving or deleting it.
   */
  public async releaseOnDisk(
    allocation: WorktreeAllocation,
    releaseMode: WorktreeReleaseMode = 'archive',
  ): Promise<WorktreeReleaseResult> {
    const normalized = createWorktreeAllocation(allocation);
    const expected = allocateWorktree(
      normalized.taskId,
      normalized.branchName,
      this.worktreeRoot,
    );
    if (normalized.branchSafety?.status === 'blocked') {
      return createWorktreeReleaseResult({
        id: `${normalized.id}:release:${releaseMode}`,
        summary: `Blocked worktree release for ${normalized.branchName}`,
        status: 'blocked',
        trace: [...normalized.trace, 'git:release:blocked'],
        updatedAt: new Date().toISOString(),
        taskId: normalized.taskId,
        branchName: normalized.branchName,
        worktreePath: normalized.worktreePath,
        releaseMode,
        released: false,
        branchSafety: normalized.branchSafety,
      });
    }

    if (
      !allocationPathMatchesConfiguredRoot({
        allocation: normalized,
        expected,
        repositoryRoot: this.repositoryRoot,
      })
    ) {
      return createWorktreeReleaseResult({
        id: `${normalized.id}:release:${releaseMode}`,
        summary: `Blocked worktree release for ${normalized.branchName}`,
        status: 'blocked',
        trace: [...normalized.trace, WORKTREE_RELEASE_PATH_MISMATCH_TRACE],
        updatedAt: new Date().toISOString(),
        taskId: normalized.taskId,
        branchName: normalized.branchName,
        worktreePath: normalized.worktreePath,
        releaseMode,
        released: false,
        branchSafety: evaluateWorktreeBranchSafety(normalized.branchName),
      });
    }

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
