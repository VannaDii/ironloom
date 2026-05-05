export {
  DEVPLAT_ACTION_COMMENT_PR as GITHUB_ACTION_COMMENT_PR,
  DEVPLAT_ACTION_CREATE_PR as GITHUB_ACTION_CREATE_PR,
  DEVPLAT_ACTION_MERGE_PR as GITHUB_ACTION_MERGE_PR,
  DEVPLAT_ACTION_SYNC_BRANCH as GITHUB_ACTION_SYNC_BRANCH,
  DEVPLAT_ACTION_UPDATE_PR as GITHUB_ACTION_UPDATE_PR,
} from '@vannadii/devplat-core';

/**
 * HTTP method used for GitHub create and comment operations.
 */
export const GITHUB_HTTP_METHOD_POST = 'POST';

/**
 * HTTP method used for GitHub pull request update operations.
 */
export const GITHUB_HTTP_METHOD_PATCH = 'PATCH';

/**
 * HTTP method used for GitHub merge and branch sync operations.
 */
export const GITHUB_HTTP_METHOD_PUT = 'PUT';

/**
 * Submission mode that sends requests to GitHub.
 */
export const GITHUB_SUBMISSION_MODE_LIVE = 'live';

/**
 * Submission mode that returns the request without sending it.
 */
export const GITHUB_SUBMISSION_MODE_DRY_RUN = 'dry-run';

/**
 * Default GitHub REST API endpoint.
 */
export const GITHUB_DEFAULT_API_BASE_URL = 'https://api.github.com';

/**
 * GitHub REST API version requested by live submissions.
 */
export const GITHUB_REST_API_VERSION = '2022-11-28';

/**
 * Dry-run receipts use status zero because no HTTP exchange occurred.
 */
export const GITHUB_DRY_RUN_STATUS_CODE = 0;

/**
 * Inclusive lower bound for successful GitHub REST status codes.
 */
export const GITHUB_HTTP_SUCCESS_MIN_STATUS_CODE = 200;

/**
 * Exclusive upper bound for successful GitHub REST status codes.
 */
export const GITHUB_HTTP_SUCCESS_MAX_EXCLUSIVE_STATUS_CODE = 300;

/**
 * Default actor used when the GitHub workflow service records telemetry.
 */
export const GITHUB_WORKFLOW_DEFAULT_ACTOR_ID = 'github-service';

/**
 * Telemetry scope used for GitHub workflow actions.
 */
export const GITHUB_WORKFLOW_TELEMETRY_SCOPE = 'github';

/**
 * Prefix used for GitHub workflow telemetry event identifiers.
 */
export const GITHUB_WORKFLOW_TELEMETRY_ID_PREFIX = 'telemetry';

/**
 * Trace segment applied to GitHub workflow telemetry events.
 */
export const GITHUB_WORKFLOW_TELEMETRY_TRACE = 'github:workflow';
