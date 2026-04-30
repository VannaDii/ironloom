import { appendTrace } from '@vannadii/devplat-core';

import type {
  DevplatConfig,
  DiscordInstallScope,
  DiscordPermission,
} from './types.js';

const DISCORD_INSTALL_SCOPES: readonly DiscordInstallScope[] = [
  'bot',
  'applications.commands',
];

const DISCORD_REQUIRED_PERMISSIONS: readonly DiscordPermission[] = [
  'ViewChannel',
  'SendMessages',
  'CreatePublicThreads',
  'CreatePrivateThreads',
  'SendMessagesInThreads',
  'ManageThreads',
  'ReadMessageHistory',
];

function requireEnvValue(
  env: Record<string, string | undefined>,
  key: 'DISCORD_APPLICATION_ID' | 'DISCORD_PUBLIC_KEY' | 'DISCORD_BOT_TOKEN',
): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} must be set for Discord runtime configuration.`);
  }

  return value;
}

export function createDevplatConfig(input: DevplatConfig): DevplatConfig {
  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    'config:load-runtime-config',
  );
}

export function createDefaultDevplatConfig(
  env: Record<string, string | undefined>,
): DevplatConfig {
  return createDevplatConfig({
    id: 'devplat-config',
    summary: 'Resolved DevPlat runtime configuration',
    status: 'approved',
    trace: [],
    updatedAt: new Date().toISOString(),
    githubOwner: env['GITHUB_OWNER'] ?? 'VannaDii',
    githubRepo: env['GITHUB_REPO'] ?? 'devplat',
    discord: {
      apiBaseUrl: env['DISCORD_API_BASE_URL'] ?? 'https://discord.com/api/v10',
      apiVersion: 'v10',
      applicationId: requireEnvValue(env, 'DISCORD_APPLICATION_ID'),
      publicKey: requireEnvValue(env, 'DISCORD_PUBLIC_KEY'),
      botToken: requireEnvValue(env, 'DISCORD_BOT_TOKEN'),
      installScopes: [...DISCORD_INSTALL_SCOPES],
      requiredPermissions: [...DISCORD_REQUIRED_PERMISSIONS],
      defaultGuildId: env['DISCORD_DEFAULT_GUILD_ID'] ?? 'devplat-guild',
      specChannelId: env['DISCORD_SPEC_CHANNEL_ID'] ?? 'spec-channel',
      implementationChannelId:
        env['DISCORD_IMPLEMENTATION_CHANNEL_ID'] ?? 'implementation-channel',
      pullRequestChannelId:
        env['DISCORD_PULL_REQUEST_CHANNEL_ID'] ?? 'pull-request-channel',
      auditChannelId: env['DISCORD_AUDIT_CHANNEL_ID'] ?? 'audit-channel',
      projectManagementChannelId:
        env['DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID'] ??
        'project-management-channel',
      threadBindingMode: 'inherit-parent',
    },
    openclaw: {
      pluginId: env['OPENCLAW_PLUGIN_ID'] ?? '@vannadii/devplat-openclaw',
      actionGates: {
        approveThis: true,
        mergeNow: false,
        retryGates: true,
        rebaseAllDependents: false,
      },
    },
    sonar: {
      organization: env['SONAR_ORGANIZATION'] ?? 'vannadii',
      projectKey: env['SONAR_PROJECT_KEY'] ?? 'vannadii_devplat',
      minimumCoverage: 90,
    },
  });
}

export function describeDevplatConfig(config: DevplatConfig): string {
  return `${config.githubOwner}/${config.githubRepo} -> ${config.summary}`;
}
