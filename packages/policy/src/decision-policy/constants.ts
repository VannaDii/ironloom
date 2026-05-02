import {
  DEVPLAT_ACTION_APPLY_AUTOFIX,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_AUTOFIX,
  DEVPLAT_ACTION_AUTOFIX_REVIEW,
  DEVPLAT_ACTION_CLEANUP_ARTIFACTS,
  DEVPLAT_ACTION_DELETE_WORKTREE,
  DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP,
  DEVPLAT_ACTION_EXECUTE_COMMAND,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_MERGE_PR,
  DEVPLAT_ACTION_PUBLISH,
  DEVPLAT_ACTION_PUBLISH_RELEASE,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_REBASE_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_COMMAND,
  DEVPLAT_ACTION_RUN_GATES,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
} from '@vannadii/devplat-core';

/**
 * Policy category for pull-request merge actions.
 */
export const POLICY_ACTION_CATEGORY_MERGE = 'merge';

/**
 * Policy category for local command execution actions.
 */
export const POLICY_ACTION_CATEGORY_COMMAND_EXECUTION = 'command-execution';

/**
 * Policy category for worktree release actions.
 */
export const POLICY_ACTION_CATEGORY_WORKTREE_RELEASE = 'worktree-release';

/**
 * Policy category for branch rebase actions.
 */
export const POLICY_ACTION_CATEGORY_REBASE = 'rebase';

/**
 * Policy category for release publication actions.
 */
export const POLICY_ACTION_CATEGORY_PUBLISH = DEVPLAT_ACTION_PUBLISH;

/**
 * Policy category for autofix actions.
 */
export const POLICY_ACTION_CATEGORY_AUTOFIX = DEVPLAT_ACTION_AUTOFIX;

/**
 * Policy category for destructive cleanup actions.
 */
export const POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP =
  DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP;

/**
 * Policy category for routine actions.
 */
export const POLICY_ACTION_CATEGORY_ROUTINE = 'routine';

/**
 * Lifecycle actions that are sensitive even when not otherwise privileged.
 */
export const POLICY_SENSITIVE_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
];

/**
 * Lifecycle actions that release or remove worktree state.
 */
export const POLICY_DESTRUCTIVE_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_RELEASE_WORKTREE,
];

/**
 * Lifecycle actions that publish external release artifacts.
 */
export const POLICY_EXTERNAL_PUBLISH_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_PUBLISH,
  DEVPLAT_ACTION_PUBLISH_RELEASE,
];

/**
 * Lifecycle actions that merge pull-request work.
 */
export const POLICY_MERGE_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_MERGE_PR,
];

/**
 * Lifecycle actions that execute local or gate commands.
 */
export const POLICY_COMMAND_EXECUTION_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_EXECUTE_COMMAND,
  DEVPLAT_ACTION_RUN_COMMAND,
  DEVPLAT_ACTION_RUN_GATES,
  DEVPLAT_ACTION_RETRY_GATES,
];

/**
 * Lifecycle actions that rebase dependent branches.
 */
export const POLICY_REBASE_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_REBASE_DEPENDENTS,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
];

/**
 * Lifecycle actions that run generated remediation or autofix changes.
 */
export const POLICY_AUTOFIX_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_AUTOFIX_REVIEW,
  DEVPLAT_ACTION_AUTOFIX,
  DEVPLAT_ACTION_APPLY_AUTOFIX,
];

/**
 * Lifecycle actions that perform destructive cleanup.
 */
export const POLICY_DESTRUCTIVE_CLEANUP_ACTIONS: readonly string[] = [
  DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP,
  DEVPLAT_ACTION_DELETE_WORKTREE,
  DEVPLAT_ACTION_CLEANUP_ARTIFACTS,
];
