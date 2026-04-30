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

export const WorktreeAllocationCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  taskId: t.string,
  branchName: t.string,
  worktreePath: t.string,
});

export const WorktreeSyncResultCodec = t.type({
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
});

export const WorktreeReleaseResultCodec = t.type({
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
});

export const WorktreeGitCommandResultCodec = t.type({
  command: t.string,
  args: t.array(t.string),
  cwd: t.string,
  exitCode: t.number,
  stdout: t.string,
  stderr: t.string,
});
