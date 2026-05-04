/**
 * Default relative directory used for allocated worktrees.
 */
export const WORKTREE_DEFAULT_ROOT = '.worktrees';

/**
 * Path segment used when an unsafe branch blocks worktree allocation.
 */
export const WORKTREE_BLOCKED_PATH_SEGMENT = 'blocked';

/**
 * Path marker used to recover the worktree root from blocked allocation paths.
 */
export const WORKTREE_BLOCKED_PATH_MARKER = `/${WORKTREE_BLOCKED_PATH_SEGMENT}/`;

/**
 * Git ref characters that are unsafe in generated worktree branch names.
 */
export const WORKTREE_UNSAFE_GIT_REF_CHARACTERS = [
  '~',
  '^',
  ':',
  '?',
  '*',
  '[',
  ']',
  '\\',
];

/**
 * Generic exit code used when Node reports a runner failure without child exit metadata.
 */
export const WORKTREE_GIT_RUNNER_GENERIC_FAILURE_EXIT_CODE = 1;

/**
 * Trace marker used when sync refuses a caller-supplied worktree path mismatch.
 */
export const WORKTREE_SYNC_PATH_MISMATCH_TRACE =
  'git:sync:path-mismatch:blocked';

/**
 * Trace marker used when release refuses a caller-supplied worktree path mismatch.
 */
export const WORKTREE_RELEASE_PATH_MISMATCH_TRACE =
  'git:release:path-mismatch:blocked';

/**
 * Safe placeholder branch recorded when sync refuses an unsafe base branch.
 */
export const WORKTREE_BLOCKED_BASE_BRANCH_NAME = 'blocked-base-branch';

/**
 * Trace marker used when sync refuses an unsafe base branch before Git runs.
 */
export const WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE =
  'git:sync:base-branch:blocked';
