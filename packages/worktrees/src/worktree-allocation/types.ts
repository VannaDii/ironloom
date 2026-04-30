import type { LifecycleStatus } from '@vannadii/devplat-core';

export interface WorktreeAllocation {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  taskId: string;
  branchName: string;
  worktreePath: string;
}

export type WorktreeSyncMode = 'fast-forward' | 'rebase';

export interface WorktreeSyncResult {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  taskId: string;
  branchName: string;
  worktreePath: string;
  baseBranch: string;
  syncMode: WorktreeSyncMode;
  changed: boolean;
  conflictsDetected: boolean;
}

export type WorktreeReleaseMode = 'archive' | 'delete';

export interface WorktreeReleaseResult {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  taskId: string;
  branchName: string;
  worktreePath: string;
  releaseMode: WorktreeReleaseMode;
  released: boolean;
}

export interface WorktreeGitCommandResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}
