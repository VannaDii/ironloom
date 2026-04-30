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

function readEnvValue(
  env: Record<string, string | undefined>,
  key: string,
  fallback: string,
): string {
  return env[key]?.trim() || fallback;
}

function readEnvNumber(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const rawValue = env[key]?.trim();
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return parsed;
}

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
  const githubOwner = readEnvValue(env, 'GITHUB_OWNER', 'VannaDii');
  const githubRepo = readEnvValue(env, 'GITHUB_REPO', 'devplat');
  const defaultBranch = readEnvValue(env, 'GITHUB_DEFAULT_BRANCH', 'main');

  return createDevplatConfig({
    id: 'devplat-config',
    summary: 'Resolved DevPlat runtime configuration',
    status: 'approved',
    trace: [],
    updatedAt: new Date().toISOString(),
    githubOwner,
    githubRepo,
    repository: {
      owner: githubOwner,
      repo: githubRepo,
      defaultBranch,
      repositoryKey: `${githubOwner}/${githubRepo}`,
    },
    storage: {
      rootDirectory: readEnvValue(env, 'DEVPLAT_STORAGE_ROOT', 'devplat-state'),
      layoutVersion: 1,
    },
    worktrees: {
      rootDirectory: readEnvValue(
        env,
        'DEVPLAT_WORKTREE_ROOT',
        'devplat-worktrees',
      ),
      baseBranch: defaultBranch,
    },
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
      gateway: {
        bind: 'loopback',
        port: readEnvNumber(env, 'OPENCLAW_GATEWAY_PORT', 18789),
        authMode: 'token',
      },
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
