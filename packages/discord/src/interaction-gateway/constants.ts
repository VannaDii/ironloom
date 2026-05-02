/**
 * Discord Gateway dispatch opcode.
 */
export const DISCORD_GATEWAY_DISPATCH_OPCODE = 0;

/**
 * Discord Gateway heartbeat opcode.
 */
export const DISCORD_GATEWAY_HEARTBEAT_OPCODE = 1;

/**
 * Discord Gateway identify opcode.
 */
export const DISCORD_GATEWAY_IDENTIFY_OPCODE = 2;

/**
 * Discord Gateway reconnect opcode.
 */
export const DISCORD_GATEWAY_RECONNECT_OPCODE = 7;

/**
 * Discord Gateway invalid session opcode.
 */
export const DISCORD_GATEWAY_INVALID_SESSION_OPCODE = 9;

/**
 * Discord Gateway hello opcode.
 */
export const DISCORD_GATEWAY_HELLO_OPCODE = 10;

/**
 * Discord Gateway heartbeat acknowledgement opcode.
 */
export const DISCORD_GATEWAY_HEARTBEAT_ACK_OPCODE = 11;

/**
 * Discord Gateway event name for application command and component interactions.
 */
export const DISCORD_GATEWAY_INTERACTION_CREATE_EVENT = 'INTERACTION_CREATE';

/**
 * Discord Gateway URL used when runtime config does not override discovery.
 */
export const DISCORD_GATEWAY_DEFAULT_URL =
  'wss://gateway.discord.gg/?v=10&encoding=json';
