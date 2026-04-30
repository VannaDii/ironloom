import * as t from 'io-ts';

import { PullRequestRecordCodec } from '@vannadii/devplat-prs';
import {
  WorktreeSyncModeCodec,
  WorktreeSyncResultCodec,
} from '@vannadii/devplat-worktrees';

export const DependentBranchesCodec = t.array(t.string);

export const BranchDependencyGraphCodec = t.type({
  baseBranch: t.string,
  edges: t.array(
    t.type({
      fromBranch: t.string,
      toBranch: t.string,
    }),
  ),
});

export const BranchConflictClassificationCodec = t.type({
  kind: t.union([
    t.literal('none'),
    t.literal('expected'),
    t.literal('detected'),
  ]),
  affectedBranches: t.array(t.string),
  nextAction: t.string,
});

export const RebasePlanCodec = t.intersection([
  t.type({
    mergedPrNumber: t.number,
    baseBranch: t.string,
    dependentBranches: t.array(t.string),
    rebaseRequired: t.boolean,
    conflictsExpected: t.boolean,
    updatedAt: t.string,
  }),
  t.partial({
    dependencyGraph: BranchDependencyGraphCodec,
    conflictClassification: BranchConflictClassificationCodec,
  }),
]);

export const ExecuteRebaseDependentsInputCodec = t.intersection([
  t.type({
    record: PullRequestRecordCodec,
    dependentBranches: DependentBranchesCodec,
  }),
  t.partial({
    syncMode: WorktreeSyncModeCodec,
  }),
]);

export const RebaseExecutionResultCodec = t.type({
  plan: RebasePlanCodec,
  syncMode: WorktreeSyncModeCodec,
  syncResults: t.array(WorktreeSyncResultCodec),
  executed: t.boolean,
  conflictsDetected: t.boolean,
});
