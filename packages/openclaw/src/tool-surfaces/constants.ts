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
