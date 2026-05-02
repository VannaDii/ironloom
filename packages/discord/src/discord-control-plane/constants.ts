/**
 * Discord interaction callback response type for an immediate channel message.
 */
export const DISCORD_INTERACTION_CHANNEL_MESSAGE_RESPONSE_TYPE = 4;

/**
 * Discord interaction callback response type for deferred async work.
 */
export const DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE = 5;

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
 * Versioned prefix for DevPlat component custom ids.
 */
export const DISCORD_COMPONENT_CUSTOM_ID_PREFIX = 'devplat:v1';

/**
 * Inclusive lower bound for successful Discord REST response status codes.
 */
export const DISCORD_REST_SUCCESS_MIN_STATUS = 200;

/**
 * Exclusive upper bound for successful Discord REST response status codes.
 */
export const DISCORD_REST_SUCCESS_MAX_EXCLUSIVE_STATUS = 300;
