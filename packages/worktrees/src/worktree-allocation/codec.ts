import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const WorktreeSyncModeCodec = t.union([
  t.literal('fast-forward'),
  t.literal('rebase'),
]);

export const WorktreeReleaseModeCodec = t.union([
  t.literal('archive'),
  t.literal('delete'),
]);

export const WorktreeBranchSafetyStatusCodec = t.union([
  t.literal('safe'),
  t.literal('blocked'),
]);

export const WorktreeBranchSafetyCheckCodec = t.type({
  status: WorktreeBranchSafetyStatusCodec,
  branchName: t.string,
  normalizedBranchName: t.string,
  reason: t.string,
  nextAction: t.string,
});

export const WorktreeAllocationCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    taskId: t.string,
    branchName: t.string,
    worktreePath: t.string,
  }),
  t.partial({
    branchSafety: WorktreeBranchSafetyCheckCodec,
  }),
]);

export const WorktreeSyncResultCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    taskId: t.string,
    branchName: t.string,
    worktreePath: t.string,
    baseBranch: t.string,
    syncMode: WorktreeSyncModeCodec,
    changed: t.boolean,
    conflictsDetected: t.boolean,
  }),
  t.partial({
    branchSafety: WorktreeBranchSafetyCheckCodec,
  }),
]);

export const WorktreeReleaseResultCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    taskId: t.string,
    branchName: t.string,
    worktreePath: t.string,
    releaseMode: WorktreeReleaseModeCodec,
    released: t.boolean,
  }),
  t.partial({
    branchSafety: WorktreeBranchSafetyCheckCodec,
  }),
]);

export const WorktreeGitCommandResultCodec = t.type({
  command: t.string,
  args: t.array(t.string),
  cwd: t.string,
  exitCode: t.number,
  stdout: t.string,
  stderr: t.string,
});

/** Allocated git worktree record. */
export type WorktreeAllocation = t.TypeOf<typeof WorktreeAllocationCodec>;

/** Safety status for a branch name before worktree operations. */
export type WorktreeBranchSafetyStatus = t.TypeOf<
  typeof WorktreeBranchSafetyStatusCodec
>;

/** Branch safety check result for worktree operations. */
export type WorktreeBranchSafetyCheck = t.TypeOf<
  typeof WorktreeBranchSafetyCheckCodec
>;

/** Worktree synchronization mode. */
export type WorktreeSyncMode = t.TypeOf<typeof WorktreeSyncModeCodec>;

/** Worktree synchronization result. */
export type WorktreeSyncResult = t.TypeOf<typeof WorktreeSyncResultCodec>;

/** Worktree release mode. */
export type WorktreeReleaseMode = t.TypeOf<typeof WorktreeReleaseModeCodec>;

/** Worktree release result. */
export type WorktreeReleaseResult = t.TypeOf<typeof WorktreeReleaseResultCodec>;

/** Result from a git command invoked for worktree lifecycle operations. */
export type WorktreeGitCommandResult = t.TypeOf<
  typeof WorktreeGitCommandResultCodec
>;
