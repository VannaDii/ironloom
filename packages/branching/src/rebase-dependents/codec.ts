import * as t from 'io-ts';

import { GitBranchNameCodec, IsoTimestampCodec } from '@vannadii/devplat-core';
import { PullRequestRecordCodec } from '@vannadii/devplat-prs';
import {
  WorktreeSyncModeCodec,
  WorktreeSyncResultCodec,
} from '@vannadii/devplat-worktrees';

/**
 * Codec for dependent branch lists that must contain valid Git branch names.
 */
export const DependentBranchesCodec = t.array(GitBranchNameCodec);

/**
 * Codec for branch dependency graph edges.
 */
export const BranchDependencyGraphCodec = t.type({
  baseBranch: GitBranchNameCodec,
  edges: t.array(
    t.type({
      fromBranch: GitBranchNameCodec,
      toBranch: GitBranchNameCodec,
    }),
  ),
});

/**
 * Codec for branch conflict classification after dependency analysis.
 */
export const BranchConflictClassificationCodec = t.type({
  kind: t.union([
    t.literal('none'),
    t.literal('expected'),
    t.literal('detected'),
  ]),
  affectedBranches: t.array(GitBranchNameCodec),
  nextAction: t.string,
});

/**
 * Codec for a dependent-branch rebase plan.
 */
export const RebasePlanCodec = t.intersection([
  t.type({
    mergedPrNumber: t.number,
    baseBranch: GitBranchNameCodec,
    dependentBranches: DependentBranchesCodec,
    rebaseRequired: t.boolean,
    conflictsExpected: t.boolean,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    dependencyGraph: BranchDependencyGraphCodec,
    conflictClassification: BranchConflictClassificationCodec,
  }),
]);

/**
 * Codec for executing dependent branch rebases after a PR merge.
 */
export const ExecuteRebaseDependentsInputCodec = t.intersection([
  t.type({
    record: PullRequestRecordCodec,
    dependentBranches: DependentBranchesCodec,
  }),
  t.partial({
    syncMode: WorktreeSyncModeCodec,
  }),
]);

/**
 * Codec for dependent branch rebase execution results.
 */
export const RebaseExecutionResultCodec = t.type({
  plan: RebasePlanCodec,
  syncMode: WorktreeSyncModeCodec,
  syncResults: t.array(WorktreeSyncResultCodec),
  executed: t.boolean,
  conflictsDetected: t.boolean,
});

/** Dependent-branch rebase plan. */
export type RebasePlan = t.TypeOf<typeof RebasePlanCodec>;

/** Graph describing branch dependencies after a merge. */
export type BranchDependencyGraph = t.TypeOf<typeof BranchDependencyGraphCodec>;

/** Directed branch dependency edge. */
export type BranchDependencyEdge = BranchDependencyGraph['edges'][number];

/** Conflict classification for dependent branch rebases. */
export type BranchConflictClassification = t.TypeOf<
  typeof BranchConflictClassificationCodec
>;

/** Input for executing dependent branch rebases. */
export type ExecuteRebaseDependentsInput = t.TypeOf<
  typeof ExecuteRebaseDependentsInputCodec
>;

/** Result of dependent branch rebase execution. */
export type RebaseExecutionResult = t.TypeOf<typeof RebaseExecutionResultCodec>;
