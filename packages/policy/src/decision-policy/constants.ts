/**
 * Operator action that records explicit approval.
 */
export const POLICY_ACTION_APPROVE_THIS = 'approve-this';

/**
 * Operator action that requests an immediate merge.
 */
export const POLICY_ACTION_MERGE_NOW = 'merge-now';

/**
 * GitHub workflow action that merges a pull request.
 */
export const POLICY_ACTION_MERGE_PR = 'merge-pr';

/**
 * Operator action that rebases all dependent branches.
 */
export const POLICY_ACTION_REBASE_ALL_DEPENDENTS = 'rebase-all-dependents';

/**
 * Platform action that rebases dependent branches.
 */
export const POLICY_ACTION_REBASE_DEPENDENTS = 'rebase-dependents';

/**
 * Operator action that synchronizes a worktree.
 */
export const POLICY_ACTION_SYNC_WORKTREE = 'sync-worktree';

/**
 * Operator action that releases a worktree.
 */
export const POLICY_ACTION_RELEASE_WORKTREE = 'release-worktree';

/**
 * Operator action that updates a bound spec.
 */
export const POLICY_ACTION_UPDATE_SPEC = 'update-spec';

/**
 * External publish action for a generic release operation.
 */
export const POLICY_ACTION_PUBLISH = 'publish';

/**
 * External publish action for a release publication.
 */
export const POLICY_ACTION_PUBLISH_RELEASE = 'publish-release';

/**
 * Platform action that executes a command.
 */
export const POLICY_ACTION_EXECUTE_COMMAND = 'execute-command';

/**
 * Platform action that runs a command.
 */
export const POLICY_ACTION_RUN_COMMAND = 'run-command';

/**
 * Platform action that runs quality gates.
 */
export const POLICY_ACTION_RUN_GATES = 'run-gates';

/**
 * Operator action that retries quality gates.
 */
export const POLICY_ACTION_RETRY_GATES = 'retry-gates';

/**
 * Platform action that applies review autofixes.
 */
export const POLICY_ACTION_AUTOFIX_REVIEW = 'autofix-review';

/**
 * Platform action that runs autofix automation.
 */
export const POLICY_ACTION_AUTOFIX = 'autofix';

/**
 * Platform action that applies generated autofixes.
 */
export const POLICY_ACTION_APPLY_AUTOFIX = 'apply-autofix';

/**
 * Platform action that performs destructive cleanup.
 */
export const POLICY_ACTION_DESTRUCTIVE_CLEANUP = 'destructive-cleanup';

/**
 * Platform action that deletes a worktree.
 */
export const POLICY_ACTION_DELETE_WORKTREE = 'delete-worktree';

/**
 * Platform action that cleans up artifacts.
 */
export const POLICY_ACTION_CLEANUP_ARTIFACTS = 'cleanup-artifacts';

/**
 * Lifecycle actions that are sensitive even when not otherwise privileged.
 */
export const POLICY_SENSITIVE_ACTIONS: readonly string[] = [
  POLICY_ACTION_APPROVE_THIS,
  POLICY_ACTION_MERGE_NOW,
  POLICY_ACTION_REBASE_ALL_DEPENDENTS,
  POLICY_ACTION_SYNC_WORKTREE,
  POLICY_ACTION_RELEASE_WORKTREE,
  POLICY_ACTION_UPDATE_SPEC,
];

/**
 * Lifecycle actions that release or remove worktree state.
 */
export const POLICY_DESTRUCTIVE_ACTIONS: readonly string[] = [
  POLICY_ACTION_RELEASE_WORKTREE,
];

/**
 * Lifecycle actions that publish external release artifacts.
 */
export const POLICY_EXTERNAL_PUBLISH_ACTIONS: readonly string[] = [
  POLICY_ACTION_PUBLISH,
  POLICY_ACTION_PUBLISH_RELEASE,
];

/**
 * Lifecycle actions that merge pull-request work.
 */
export const POLICY_MERGE_ACTIONS: readonly string[] = [
  POLICY_ACTION_MERGE_NOW,
  POLICY_ACTION_MERGE_PR,
];

/**
 * Lifecycle actions that execute local or gate commands.
 */
export const POLICY_COMMAND_EXECUTION_ACTIONS: readonly string[] = [
  POLICY_ACTION_EXECUTE_COMMAND,
  POLICY_ACTION_RUN_COMMAND,
  POLICY_ACTION_RUN_GATES,
  POLICY_ACTION_RETRY_GATES,
];

/**
 * Lifecycle actions that rebase dependent branches.
 */
export const POLICY_REBASE_ACTIONS: readonly string[] = [
  POLICY_ACTION_REBASE_DEPENDENTS,
  POLICY_ACTION_REBASE_ALL_DEPENDENTS,
];

/**
 * Lifecycle actions that run generated remediation or autofix changes.
 */
export const POLICY_AUTOFIX_ACTIONS: readonly string[] = [
  POLICY_ACTION_AUTOFIX_REVIEW,
  POLICY_ACTION_AUTOFIX,
  POLICY_ACTION_APPLY_AUTOFIX,
];

/**
 * Lifecycle actions that perform destructive cleanup.
 */
export const POLICY_DESTRUCTIVE_CLEANUP_ACTIONS: readonly string[] = [
  POLICY_ACTION_DESTRUCTIVE_CLEANUP,
  POLICY_ACTION_DELETE_WORKTREE,
  POLICY_ACTION_CLEANUP_ARTIFACTS,
];
