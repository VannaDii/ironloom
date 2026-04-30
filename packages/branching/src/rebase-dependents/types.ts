import type * as t from 'io-ts';

import type {
  BranchConflictClassificationCodec,
  BranchDependencyGraphCodec,
  ExecuteRebaseDependentsInputCodec,
  RebaseExecutionResultCodec,
  RebasePlanCodec,
} from './codec.js';

export type RebasePlan = t.TypeOf<typeof RebasePlanCodec>;

export type BranchDependencyGraph = t.TypeOf<typeof BranchDependencyGraphCodec>;

export type BranchDependencyEdge = BranchDependencyGraph['edges'][number];

export type BranchConflictClassification = t.TypeOf<
  typeof BranchConflictClassificationCodec
>;

export type ExecuteRebaseDependentsInput = t.TypeOf<
  typeof ExecuteRebaseDependentsInputCodec
>;

export type RebaseExecutionResult = t.TypeOf<typeof RebaseExecutionResultCodec>;
