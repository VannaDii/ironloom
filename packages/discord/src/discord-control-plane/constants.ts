/**
 * Discord interaction callback response type for an immediate channel message.
 */
export const DISCORD_INTERACTION_CHANNEL_MESSAGE_RESPONSE_TYPE = 4;

/**
 * Discord interaction callback response type for deferred async work.
 */
export const DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE = 5;

/**
 * Discord component callback response type for deferred message updates.
 */
export const DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE = 6;

/**
 * Environment variable that provides the Discord application id for follow-up webhooks.
 */
export const DISCORD_APPLICATION_ID_ENVIRONMENT_VARIABLE =
  'DISCORD_APPLICATION_ID';

/**
 * Discord message flag for ephemeral interaction responses.
 */
export const DISCORD_EPHEMERAL_MESSAGE_FLAG = 64;

/**
 * Discord action-row component type.
 */
export const DISCORD_ACTION_ROW_COMPONENT_TYPE = 1;

/**
 * Discord button component type.
 */
export const DISCORD_BUTTON_COMPONENT_TYPE = 2;

/**
 * Discord secondary button style used for neutral DevPlat controls.
 */
export const DISCORD_BUTTON_STYLE_SECONDARY = 2;

/**
 * Discord primary button style used for normal DevPlat actions.
 */
export const DISCORD_BUTTON_STYLE_PRIMARY = 1;

/**
 * Discord success button style used for approving DevPlat actions.
 */
export const DISCORD_BUTTON_STYLE_SUCCESS = 3;

/**
 * Discord danger button style used for blocking DevPlat actions.
 */
export const DISCORD_BUTTON_STYLE_DANGER = 4;

/**
 * Maximum Discord button label length.
 */
export const DISCORD_BUTTON_LABEL_MAX_LENGTH = 80;

/**
 * Maximum Discord component custom_id length.
 */
export const DISCORD_CUSTOM_ID_MAX_LENGTH = 100;

/**
 * Maximum Discord message content length.
 */
export const DISCORD_MESSAGE_CONTENT_MAX_LENGTH = 2000;

/**
 * Number of milliseconds in one Unix timestamp second.
 */
export const DISCORD_MILLISECONDS_PER_SECOND = 1000;

/**
 * Marker appended when Discord message content is truncated to satisfy length limits.
 */
export const DISCORD_MESSAGE_CONTENT_TRUNCATED_MARKER = '(content truncated)';

/**
 * Default operator-facing estimate for deferred work without a precise ETA.
 */
export const DISCORD_DEFAULT_RESPONSE_TIME_ESTIMATE = 'when job completes';

/**
 * Label used before Discord route-failure event diagnostics.
 */
export const DISCORD_ROUTE_FAILURE_EVENT_LABEL = 'Received event:';

/**
 * Placeholder used when rendering sensitive Discord event fields.
 */
export const DISCORD_ROUTE_FAILURE_REDACTED_VALUE = '[redacted]';

/**
 * Marker appended when a Discord route-failure diagnostic is shortened.
 */
export const DISCORD_ROUTE_FAILURE_TRUNCATED_MARKER = '(truncated)';

/**
 * Versioned prefix for DevPlat component custom ids.
 */
export const DISCORD_COMPONENT_CUSTOM_ID_PREFIX = 'devplat:v1';

/**
 * Explicit component action token for resume-project force confirmations.
 */
export const DISCORD_RESUME_PROJECT_FORCE_COMPONENT_ACTION_TOKEN =
  'resume-project-force';

/**
 * Inclusive lower bound for successful Discord REST response status codes.
 */
export const DISCORD_REST_SUCCESS_MIN_STATUS = 200;

/**
 * Exclusive upper bound for successful Discord REST response status codes.
 */
export const DISCORD_REST_SUCCESS_MAX_EXCLUSIVE_STATUS = 300;

/**
 * Pattern for strict `v<positive-integer>` project config-version markers.
 */
export const DISCORD_PROJECT_CONFIG_VERSION_PATTERN = /^v[1-9]\d*$/u;

/**
 * Minimum allowed project-name length for project bootstrap and reopen routes.
 */
export const DISCORD_PROJECT_NAME_MIN_LENGTH = 3;

/**
 * Maximum allowed project-name length for project bootstrap and reopen routes.
 */
export const DISCORD_PROJECT_NAME_MAX_LENGTH = 30;

/**
 * Upper bound for persisted Discord control request summaries.
 */
export const DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH = 1000;

/**
 * Extracts parenthesized summary marker tokens from bounded control summaries.
 */
export const DISCORD_SUMMARY_MARKER_TOKEN_PATTERN = /\([^()]*\)/gu;

/**
 * Pattern for validating base64url marker tokens embedded in control summaries.
 */
export const DISCORD_BASE64URL_MARKER_PATTERN = /^[A-Za-z0-9_-]+$/u;
