/**
 * Display placeholder used when tool payload fields carry credentials.
 */
export const REDACTED_TOOL_PAYLOAD_VALUE = '[redacted]';

/**
 * Pattern for characters ignored while normalizing tool payload keys for
 * sensitive-name detection.
 */
export const TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN = /[^a-z0-9]/giu;
