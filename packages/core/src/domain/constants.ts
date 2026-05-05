/**
 * Storage scope that contains normalized lifecycle artifacts.
 */
export const STORE_SCOPE_ARTIFACTS = 'artifacts';

/**
 * Storage scope that contains audit records for lifecycle-changing actions.
 */
export const STORE_SCOPE_AUDIT = 'audit';

/**
 * Storage scope that contains gate run results.
 */
export const STORE_SCOPE_GATES = 'gates';

/**
 * Storage scope that contains memory entries and context bundles.
 */
export const STORE_SCOPE_MEMORY = 'memory';

/**
 * Storage scope that contains pull request projections.
 */
export const STORE_SCOPE_PULL_REQUESTS = 'pull-requests';

/**
 * Storage scope that contains remediation plans and results.
 */
export const STORE_SCOPE_REMEDIATION = 'remediation';

/**
 * Storage scope that contains review findings and summaries.
 */
export const STORE_SCOPE_REVIEWS = 'reviews';

/**
 * Storage scope that contains implementation slice plans.
 */
export const STORE_SCOPE_SLICES = 'slices';

/**
 * Storage scope that contains implementation specs.
 */
export const STORE_SCOPE_SPECS = 'specs';

/**
 * Storage scope that contains general runtime state records.
 */
export const STORE_SCOPE_STATE = 'state';

/**
 * Storage scope that contains durable queue task records.
 */
export const STORE_SCOPE_TASKS = 'tasks';

/**
 * Storage scope that contains telemetry run summaries.
 */
export const STORE_SCOPE_TELEMETRY = 'telemetry';

/**
 * Storage scope that contains git worktree allocation records.
 */
export const STORE_SCOPE_WORKTREES = 'worktrees';

/**
 * Index name for active Discord thread bindings.
 */
export const STORE_INDEX_ACTIVE_THREAD = 'active-thread';

/**
 * Index name for task lookup records.
 */
export const STORE_INDEX_TASK = 'task';

/**
 * Index name for pull request lookup records.
 */
export const STORE_INDEX_PULL_REQUEST = 'pull-request';

/**
 * Index name for branch lookup records.
 */
export const STORE_INDEX_BRANCH = 'branch';

/**
 * Index name for artifact lookup records.
 */
export const STORE_INDEX_ARTIFACT = 'artifact';

/**
 * Lifecycle artifact type for operator approval decisions.
 */
export const ARTIFACT_TYPE_APPROVAL_RECORD = 'approval-record';

/**
 * Lifecycle artifact type for auditable action logs.
 */
export const ARTIFACT_TYPE_AUDIT_LOG = 'audit-log';

/**
 * Lifecycle artifact type for Discord thread-session bindings.
 */
export const ARTIFACT_TYPE_DISCORD_THREAD_SESSION = 'discord-thread-session';

/**
 * Lifecycle artifact type for gate run reports.
 */
export const ARTIFACT_TYPE_GATE_RUN_REPORT = 'gate-run-report';

/**
 * Lifecycle artifact type for merge readiness decisions.
 */
export const ARTIFACT_TYPE_MERGE_DECISION = 'merge-decision';

/**
 * Lifecycle artifact type for pull request projections.
 */
export const ARTIFACT_TYPE_PULL_REQUEST_RECORD = 'pull-request-record';

/**
 * Lifecycle artifact type for dependent branch rebase outcomes.
 */
export const ARTIFACT_TYPE_REBASE_RESULT = 'rebase-result';

/**
 * Lifecycle artifact type for remediation plans.
 */
export const ARTIFACT_TYPE_REMEDIATION_PLAN = 'remediation-plan';

/**
 * Lifecycle artifact type for attributed research briefs.
 */
export const ARTIFACT_TYPE_RESEARCH_BRIEF = 'research-brief';

/**
 * Lifecycle artifact type for review findings.
 */
export const ARTIFACT_TYPE_REVIEW_FINDING = 'review-finding';

/**
 * Lifecycle artifact type for implementation slice plans.
 */
export const ARTIFACT_TYPE_SLICE_PLAN = 'slice-plan';

/**
 * Lifecycle artifact type for revisioned specs.
 */
export const ARTIFACT_TYPE_SPEC_RECORD = 'spec-record';

/**
 * Lifecycle artifact type for durable queue tasks.
 */
export const ARTIFACT_TYPE_TASK_RECORD = 'task-record';

/**
 * Lifecycle artifact type for telemetry events.
 */
export const ARTIFACT_TYPE_TELEMETRY_EVENT = 'telemetry-event';

/**
 * Lifecycle artifact type for worktree allocations.
 */
export const ARTIFACT_TYPE_WORKTREE_ALLOCATION = 'worktree-allocation';

/**
 * Shared lifecycle action that records explicit operator approval.
 */
export const DEVPLAT_ACTION_APPROVE_THIS = 'approve-this';

/**
 * Shared lifecycle action that runs the item bound to an operator thread.
 */
export const DEVPLAT_ACTION_RUN_THIS = 'run-this';

/**
 * Shared lifecycle action that claims the item bound to an operator thread.
 */
export const DEVPLAT_ACTION_CLAIM_THIS = 'claim-this';

/**
 * Shared lifecycle action that blocks the item bound to an operator thread.
 */
export const DEVPLAT_ACTION_BLOCK_THIS = 'block-this';

/**
 * Shared lifecycle action that completes the item bound to an operator thread.
 */
export const DEVPLAT_ACTION_COMPLETE_THIS = 'complete-this';

/**
 * Shared lifecycle action that pauses automation for an operator thread.
 */
export const DEVPLAT_ACTION_PAUSE_THIS = 'pause-this';

/**
 * Shared lifecycle action that resumes automation for an operator thread.
 */
export const DEVPLAT_ACTION_RESUME_THIS = 'resume-this';

/**
 * Shared lifecycle action that requests an immediate operator merge.
 */
export const DEVPLAT_ACTION_MERGE_NOW = 'merge-now';

/**
 * Shared lifecycle action that merges a pull request through GitHub.
 */
export const DEVPLAT_ACTION_MERGE_PR = 'merge-pr';

/**
 * Shared lifecycle action that creates a pull request through GitHub.
 */
export const DEVPLAT_ACTION_CREATE_PR = 'create-pr';

/**
 * Shared lifecycle action that updates a pull request through GitHub.
 */
export const DEVPLAT_ACTION_UPDATE_PR = 'update-pr';

/**
 * Shared lifecycle action that comments on a pull request through GitHub.
 */
export const DEVPLAT_ACTION_COMMENT_PR = 'comment-pr';

/**
 * Shared lifecycle action that asks GitHub to update a pull request branch.
 */
export const DEVPLAT_ACTION_SYNC_BRANCH = 'sync-branch';

/**
 * Shared lifecycle action that rebases all dependent branches.
 */
export const DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS = 'rebase-all-dependents';

/**
 * Shared lifecycle action that rebases dependent branches.
 */
export const DEVPLAT_ACTION_REBASE_DEPENDENTS = 'rebase-dependents';

/**
 * Shared lifecycle action that synchronizes a worktree.
 */
export const DEVPLAT_ACTION_SYNC_WORKTREE = 'sync-worktree';

/**
 * Shared lifecycle action that releases a worktree.
 */
export const DEVPLAT_ACTION_RELEASE_WORKTREE = 'release-worktree';

/**
 * Shared lifecycle action that updates a bound spec.
 */
export const DEVPLAT_ACTION_UPDATE_SPEC = 'update-spec';

/**
 * Shared lifecycle action that publishes external artifacts.
 */
export const DEVPLAT_ACTION_PUBLISH = 'publish';

/**
 * Shared lifecycle action that publishes release artifacts.
 */
export const DEVPLAT_ACTION_PUBLISH_RELEASE = 'publish-release';

/**
 * Shared lifecycle action that executes a command.
 */
export const DEVPLAT_ACTION_EXECUTE_COMMAND = 'execute-command';

/**
 * Shared lifecycle action that runs a command.
 */
export const DEVPLAT_ACTION_RUN_COMMAND = 'run-command';

/**
 * Shared lifecycle action that runs quality gates.
 */
export const DEVPLAT_ACTION_RUN_GATES = 'run-gates';

/**
 * Shared lifecycle action that retries quality gates.
 */
export const DEVPLAT_ACTION_RETRY_GATES = 'retry-gates';

/**
 * Shared lifecycle action that shows status for an operator thread.
 */
export const DEVPLAT_ACTION_SHOW_STATUS = 'show-status';

/**
 * Shared lifecycle action that shows the last artifact for an operator thread.
 */
export const DEVPLAT_ACTION_SHOW_LAST_ARTIFACT = 'show-last-artifact';

/**
 * Shared lifecycle action that explains a failure for an operator thread.
 */
export const DEVPLAT_ACTION_EXPLAIN_FAILURE = 'explain-failure';

/**
 * Shared lifecycle action that applies review autofixes.
 */
export const DEVPLAT_ACTION_AUTOFIX_REVIEW = 'autofix-review';

/**
 * Shared lifecycle action that runs autofix automation.
 */
export const DEVPLAT_ACTION_AUTOFIX = 'autofix';

/**
 * Shared lifecycle action that applies generated autofixes.
 */
export const DEVPLAT_ACTION_APPLY_AUTOFIX = 'apply-autofix';

/**
 * Shared lifecycle action that performs destructive cleanup.
 */
export const DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP = 'destructive-cleanup';

/**
 * Shared lifecycle action that deletes a worktree.
 */
export const DEVPLAT_ACTION_DELETE_WORKTREE = 'delete-worktree';

/**
 * Shared lifecycle action that cleans up artifacts.
 */
export const DEVPLAT_ACTION_CLEANUP_ARTIFACTS = 'cleanup-artifacts';

/**
 * First ASCII code point disallowed in Git branch names by the control range.
 */
export const GIT_BRANCH_CONTROL_RANGE_START_CODE = 0;

/**
 * Last ASCII whitespace/control code point disallowed in Git branch names.
 */
export const GIT_BRANCH_CONTROL_RANGE_END_CODE = 32;

/**
 * ASCII DEL code point disallowed in Git branch names.
 */
export const GIT_BRANCH_DELETE_CONTROL_CODE = 127;

/**
 * Pattern for Git branch names that contain ASCII control characters, spaces,
 * or DEL. Git disallows these in refs, and the regex is tested as a contract.
 */
export const GIT_BRANCH_DISALLOWED_CONTROL_OR_SPACE_PATTERN = new RegExp(
  `[${String.fromCharCode(GIT_BRANCH_CONTROL_RANGE_START_CODE)}-${String.fromCharCode(
    GIT_BRANCH_CONTROL_RANGE_END_CODE,
  )}${String.fromCharCode(GIT_BRANCH_DELETE_CONTROL_CODE)}]`,
  'u',
);

/**
 * JSON Schema pattern equivalent for Git branch names accepted by
 * `GitBranchNameCodec`.
 */
export const GIT_BRANCH_NAME_JSON_SCHEMA_PATTERN =
  '^(?!-)(?!/)(?!.*(?:\\.\\.|//|@\\{|\\\\|~|\\^|:|\\?|\\*|\\[|(?:^|/)[^/]*\\.lock(?:/|$)))(?!.*[\\x00-\\x20\\x7f])(?!.*/$)(?!.*\\.$)(?!@$).+$';

/**
 * JSON Schema pattern equivalent for repository keys accepted by
 * `RepositoryKeyCodec`.
 */
export const REPOSITORY_KEY_JSON_SCHEMA_PATTERN =
  '^(?!.*(?:^|/)\\s)(?!.*\\s(?:/|$))[^/]+/[^/]+$';
