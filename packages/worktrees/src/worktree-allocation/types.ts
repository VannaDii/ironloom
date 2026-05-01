import type * as t from 'io-ts';

import type {
  WorktreeAllocationCodec,
  WorktreeBranchSafetyCheckCodec,
  WorktreeBranchSafetyStatusCodec,
  WorktreeGitCommandResultCodec,
  WorktreeReleaseModeCodec,
  WorktreeReleaseResultCodec,
  WorktreeSyncModeCodec,
  WorktreeSyncResultCodec,
} from './codec.js';

export type WorktreeAllocation = t.TypeOf<typeof WorktreeAllocationCodec>;

export type WorktreeBranchSafetyStatus = t.TypeOf<
  typeof WorktreeBranchSafetyStatusCodec
>;

export type WorktreeBranchSafetyCheck = t.TypeOf<
  typeof WorktreeBranchSafetyCheckCodec
>;

export type WorktreeSyncMode = t.TypeOf<typeof WorktreeSyncModeCodec>;

export type WorktreeSyncResult = t.TypeOf<typeof WorktreeSyncResultCodec>;

export type WorktreeReleaseMode = t.TypeOf<typeof WorktreeReleaseModeCodec>;

export type WorktreeReleaseResult = t.TypeOf<typeof WorktreeReleaseResultCodec>;

export type WorktreeGitCommandResult = t.TypeOf<
  typeof WorktreeGitCommandResultCodec
>;
