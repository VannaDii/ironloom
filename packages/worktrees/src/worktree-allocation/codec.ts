import * as t from 'io-ts';

import {
  GitBranchNameCodec,
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

/**
 * Codec for supported Git worktree synchronization strategies.
 */
export const WorktreeSyncModeCodec = t.union([
  t.literal('fast-forward'),
  t.literal('rebase'),
]);

/**
 * Codec for supported worktree release strategies.
 */
export const WorktreeReleaseModeCodec = t.union([
  t.literal('archive'),
  t.literal('delete'),
]);

/**
 * Codec for branch safety evaluation status.
 */
export const WorktreeBranchSafetyStatusCodec = t.union([
  t.literal('safe'),
  t.literal('blocked'),
]);

/**
 * Codec for branch safety details preserved on worktree records.
 */
export const WorktreeBranchSafetyCheckCodec = t.type({
  status: WorktreeBranchSafetyStatusCodec,
  branchName: t.string,
  normalizedBranchName: t.string,
  reason: t.string,
  nextAction: t.string,
});

/**
 * Codec for allocated worktree lifecycle records.
 */
export const WorktreeAllocationCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
    taskId: t.string,
    branchName: t.string,
    worktreePath: t.string,
  }),
  t.partial({
    branchSafety: WorktreeBranchSafetyCheckCodec,
  }),
]);

/**
 * Codec for worktree synchronization result records.
 */
export const WorktreeSyncResultCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
    taskId: t.string,
    branchName: t.string,
    worktreePath: t.string,
    baseBranch: GitBranchNameCodec,
    syncMode: WorktreeSyncModeCodec,
    changed: t.boolean,
    conflictsDetected: t.boolean,
  }),
  t.partial({
    branchSafety: WorktreeBranchSafetyCheckCodec,
  }),
]);

/**
 * Codec for worktree release result records.
 */
export const WorktreeReleaseResultCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
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

/**
 * Codec for captured Git command execution metadata.
 */
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
