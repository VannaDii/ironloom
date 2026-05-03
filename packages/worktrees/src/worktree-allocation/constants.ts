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
