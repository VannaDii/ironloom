import type {
  DeploymentTarget,
  DiscordInstallScope,
  DiscordPermission,
} from './codec.js';

/**
 * Discord OAuth scopes required for command registration and bot messaging.
 */
export const DISCORD_INSTALL_SCOPES: readonly DiscordInstallScope[] = [
  'bot',
  'applications.commands',
];

/**
 * Discord bot permissions required by the operator control plane.
 */
export const DISCORD_REQUIRED_PERMISSIONS: readonly DiscordPermission[] = [
  'ViewChannel',
  'SendMessages',
  'CreatePublicThreads',
  'CreatePrivateThreads',
  'SendMessagesInThreads',
  'ManageThreads',
  'ReadMessageHistory',
];

/**
 * Deployment targets supported by the single-repository runtime path.
 */
export const VALID_DEPLOYMENT_TARGETS: readonly DeploymentTarget[] = [
  'local-docker',
  'kubernetes',
];

/**
 * Pattern that trims a single trailing slash from normalized runtime URLs.
 */
export const TRAILING_URL_SLASH_PATTERN = /\/$/u;
