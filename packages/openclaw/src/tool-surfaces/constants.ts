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
 * Tool name for listing storage secondary index keys through the adapter.
 */
export const LIST_STORED_INDEX_TOOL_NAME = 'list_stored_index';

/**
 * Generated schema file for the storage secondary index read tool.
 */
export const READ_STORED_INDEX_SCHEMA_FILE =
  'tool-read-stored-index-params.schema.json';

/**
 * Generated schema file for the storage secondary index list tool.
 */
export const LIST_STORED_INDEX_SCHEMA_FILE =
  'tool-list-stored-index-params.schema.json';
