/**
 * Display placeholder used when tool payload fields carry credentials.
 */
export const REDACTED_TOOL_PAYLOAD_VALUE = '[redacted]';

/**
 * Environment variable that points OpenClaw tool persistence at a runtime store.
 */
export const OPENCLAW_STORAGE_ROOT_ENVIRONMENT_VARIABLE =
  'DEVPLAT_STORAGE_ROOT';

/**
 * Environment variable that points OpenClaw worktree tools at the runtime root.
 */
export const OPENCLAW_WORKTREE_ROOT_ENVIRONMENT_VARIABLE =
  'DEVPLAT_WORKTREE_ROOT';

/**
 * Environment variable that enables loopback Discord responses for tests.
 */
export const OPENCLAW_TEST_MODE_ENVIRONMENT_VARIABLE = 'DEVPLAT_TEST_MODE';

/**
 * Environment variable that provides the configured GitHub repository owner.
 */
export const OPENCLAW_GITHUB_OWNER_ENVIRONMENT_VARIABLE = 'GITHUB_OWNER';

/**
 * Environment variable that provides the configured GitHub repository name.
 */
export const OPENCLAW_GITHUB_REPO_ENVIRONMENT_VARIABLE = 'GITHUB_REPO';

/**
 * Pattern for characters ignored while normalizing tool payload keys for
 * sensitive-name detection.
 */
export const TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN = /[^a-z0-9]/giu;

/**
 * Tool name for reading a storage secondary index entry through the adapter.
 */
export const READ_STORED_INDEX_TOOL_NAME = 'read_stored_index';

/**
 * Tool name for reading a storage record through a secondary index.
 */
export const READ_INDEXED_RECORD_TOOL_NAME = 'read_indexed_record';

/**
 * Tool name for listing storage secondary index keys through the adapter.
 */
export const LIST_STORED_INDEX_TOOL_NAME = 'list_stored_index';

/**
 * Generated schema file for the storage secondary index read tool.
 */
export const READ_STORED_INDEX_SCHEMA_FILE =
  'tool-read-stored-index-params.schema.json';

/**
 * Generated schema file for the storage indexed record read tool.
 */
export const READ_INDEXED_RECORD_SCHEMA_FILE =
  'tool-read-indexed-record-params.schema.json';

/**
 * Generated schema file for the storage secondary index list tool.
 */
export const LIST_STORED_INDEX_SCHEMA_FILE =
  'tool-list-stored-index-params.schema.json';

/**
 * Default actor id used when an OpenClaw tool input does not provide one.
 */
export const OPENCLAW_DEFAULT_ACTOR_ID = 'openclaw';

/**
 * Prefix for telemetry events emitted by the OpenClaw gate runner tool.
 */
export const OPENCLAW_RUN_GATES_TELEMETRY_ID_PREFIX = 'telemetry:run-gates';

/**
 * Trace marker for telemetry emitted by the OpenClaw gate runner tool.
 */
export const OPENCLAW_RUN_GATES_TRACE = 'openclaw:run-gates';

/**
 * Action name used for Sonar quality-gate telemetry events emitted by OpenClaw.
 */
export const OPENCLAW_ACTION_EVALUATE_SONAR_QUALITY_GATE =
  'evaluate-sonar-quality-gate';

/**
 * Prefix for telemetry events emitted by the OpenClaw Sonar quality-gate tool.
 */
export const OPENCLAW_SONAR_QUALITY_GATE_TELEMETRY_ID_PREFIX =
  'telemetry:sonar-quality-gate';

/**
 * Trace marker for telemetry emitted by the OpenClaw Sonar quality-gate tool.
 */
export const OPENCLAW_SONAR_QUALITY_GATE_TRACE = 'openclaw:sonar-quality-gate';

/**
 * Result key used by OpenClaw tool responses for adapter-level lifecycle
 * evidence.
 */
export const OPENCLAW_OPERATIONAL_RESULT_KEY = 'operationalResult';

/**
 * Payload field that carries an artifact identifier.
 */
export const OPENCLAW_TOOL_FIELD_ARTIFACT_ID = 'artifactId';

/**
 * Payload field that marks a payload as an artifact envelope.
 */
export const OPENCLAW_TOOL_FIELD_ARTIFACT_TYPE = 'artifactType';

/**
 * Payload field that carries a stable object identifier.
 */
export const OPENCLAW_TOOL_FIELD_ID = 'id';

/**
 * Payload field that carries a storage key.
 */
export const OPENCLAW_TOOL_FIELD_KEY = 'key';

/**
 * Payload field that carries persisted storage evidence.
 */
export const OPENCLAW_TOOL_FIELD_PERSISTED_KEY = 'persistedKey';

/**
 * Operational result field that carries normalized persisted storage evidence.
 */
export const OPENCLAW_TOOL_FIELD_PERSISTED_RECORD_KEY = 'persistedRecordKey';

/**
 * Payload field that carries policy decision evidence.
 */
export const OPENCLAW_TOOL_FIELD_POLICY_DECISION_ID = 'policyDecisionId';

/**
 * Payload field that carries the next lifecycle hint.
 */
export const OPENCLAW_TOOL_FIELD_NEXT_ACTION = 'nextAction';

/**
 * Payload field that carries a package result record.
 */
export const OPENCLAW_TOOL_FIELD_RECORD = 'record';

/**
 * Payload field that carries delegated branch-safety detail.
 */
export const OPENCLAW_TOOL_FIELD_BRANCH_SAFETY = 'branchSafety';

/**
 * Payload field that carries delegated gate classification detail.
 */
export const OPENCLAW_TOOL_FIELD_CLASSIFICATION = 'classification';

/**
 * Payload field that carries telemetry persistence evidence.
 */
export const OPENCLAW_TOOL_FIELD_TELEMETRY_EVENT_ID = 'telemetryEventId';

/**
 * Payload field that carries lifecycle status.
 */
export const OPENCLAW_TOOL_FIELD_STATUS = 'status';

/**
 * Payload field that carries policy allowance.
 */
export const OPENCLAW_TOOL_FIELD_ALLOWED = 'allowed';

/**
 * Payload field that carries result success.
 */
export const OPENCLAW_TOOL_FIELD_SUCCESS = 'success';

/**
 * Payload field that carries gate pass/fail status.
 */
export const OPENCLAW_TOOL_FIELD_PASSED = 'passed';

/**
 * Operational status emitted for allowed policy outcomes.
 */
export const OPENCLAW_OPERATIONAL_STATUS_ALLOWED = 'allowed';

/**
 * Operational status emitted for blocked policy outcomes.
 */
export const OPENCLAW_OPERATIONAL_STATUS_BLOCKED = 'blocked';

/**
 * Operational status emitted for successful boolean outcomes.
 */
export const OPENCLAW_OPERATIONAL_STATUS_SUCCEEDED = 'succeeded';

/**
 * Operational status emitted for failed boolean outcomes.
 */
export const OPENCLAW_OPERATIONAL_STATUS_FAILED = 'failed';
