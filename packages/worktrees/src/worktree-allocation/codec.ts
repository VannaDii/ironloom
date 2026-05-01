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
