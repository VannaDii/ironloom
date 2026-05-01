import { appendTrace } from '@vannadii/devplat-core';

import {
  DISCORD_INSTALL_SCOPES,
  DISCORD_REQUIRED_PERMISSIONS,
  TRAILING_URL_SLASH_PATTERN,
  VALID_DEPLOYMENT_TARGETS,
} from './constants.js';
import type {
  DeploymentTarget,
  DevplatConfig,
  RuntimeConfigValidationIssue,
} from './types.js';

/**
 * Reads an environment value with whitespace trimming and fallback support.
 */
function readEnvValue(
  env: Record<string, string | undefined>,
  key: string,
  fallback: string,
): string {
  return env[key]?.trim() || fallback;
}

/**
 * Reads and normalizes a URL environment value.
 */
function readEnvUrl(
  env: Record<string, string | undefined>,
  key: string,
  fallback: string,
): string {
  const value = readEnvValue(env, key, fallback);
  try {
    return new URL(value).toString().replace(TRAILING_URL_SLASH_PATTERN, '');
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }
}

/**
 * Reads a positive integer environment value.
 */
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

/**
 * Reads the configured deployment target and rejects unsupported values.
 */
function readDeploymentTarget(
  env: Record<string, string | undefined>,
): DeploymentTarget {
  const value = readEnvValue(env, 'DEVPLAT_DEPLOYMENT_TARGET', 'local-docker');
  const target = VALID_DEPLOYMENT_TARGETS.find(
    (candidate) => candidate === value,
  );
  if (target === undefined) {
    throw new Error(
      'DEVPLAT_DEPLOYMENT_TARGET must be local-docker or kubernetes.',
    );
  }

  return target;
}

/**
 * Requires a Discord credential environment value.
 */
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

/**
 * Builds a normalized runtime configuration validation issue.
 */
function createValidationIssue(input: {
  field: string;
  code: string;
  message: string;
}): RuntimeConfigValidationIssue {
  return {
    field: input.field.trim(),
    code: input.code.trim(),
    message: input.message.trim(),
    severity: 'error',
  };
}

function hasBlankValue(value: string): boolean {
  return value.trim().length === 0;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function appendNonEmptyIssue(
  issues: RuntimeConfigValidationIssue[],
  field: string,
  value: string,
): RuntimeConfigValidationIssue[] {
  if (!hasBlankValue(value)) {
    return issues;
  }

  return [
    ...issues,
    createValidationIssue({
      field,
      code: 'config.empty-value',
      message: `${field} must not be empty.`,
    }),
  ];
}

export function validateDevplatConfig(
  config: DevplatConfig,
): readonly RuntimeConfigValidationIssue[] {
  const textChecks: readonly (readonly [string, string])[] = [
    ['repository.owner', config.repository.owner],
    ['repository.repo', config.repository.repo],
    ['repository.defaultBranch', config.repository.defaultBranch],
    ['repository.repositoryKey', config.repository.repositoryKey],
    ['github.tokenEnvironmentVariable', config.github.tokenEnvironmentVariable],
    ['storage.rootDirectory', config.storage.rootDirectory],
    ['storage.artifactDirectory', config.storage.artifactDirectory],
    ['storage.indexDirectory', config.storage.indexDirectory],
    ['storage.auditLogDirectory', config.storage.auditLogDirectory],
    ['worktrees.rootDirectory', config.worktrees.rootDirectory],
    ['worktrees.baseBranch', config.worktrees.baseBranch],
    [
      'deployment.dockerImageRepository',
      config.deployment.dockerImageRepository,
    ],
    ['deployment.dockerImageTag', config.deployment.dockerImageTag],
    ['deployment.helmReleaseName', config.deployment.helmReleaseName],
    ['deployment.helmNamespace', config.deployment.helmNamespace],
    ['deployment.helmChartPath', config.deployment.helmChartPath],
    ['deployment.stateMountPath', config.deployment.stateMountPath],
    ['discord.defaultGuildId', config.discord.defaultGuildId],
    ['discord.specChannelId', config.discord.specChannelId],
    ['discord.implementationChannelId', config.discord.implementationChannelId],
    ['discord.pullRequestChannelId', config.discord.pullRequestChannelId],
    ['discord.auditChannelId', config.discord.auditChannelId],
    [
      'discord.projectManagementChannelId',
      config.discord.projectManagementChannelId,
    ],
    ['sonar.organization', config.sonar.organization],
    ['sonar.projectKey', config.sonar.projectKey],
  ];

  const emptyIssues: RuntimeConfigValidationIssue[] = [];
  const nonEmptyIssues = textChecks.reduce(
    (issues, check) => appendNonEmptyIssue(issues, check[0], check[1]),
    emptyIssues,
  );

  const urlChecks: readonly (readonly [string, string])[] = [
    ['github.apiBaseUrl', config.github.apiBaseUrl],
    ['github.webBaseUrl', config.github.webBaseUrl],
    ['discord.apiBaseUrl', config.discord.apiBaseUrl],
  ];
  const urlIssues = urlChecks.flatMap(([field, value]) =>
    isValidUrl(value)
      ? []
      : [
          createValidationIssue({
            field,
            code: 'config.invalid-url',
            message: `${field} must be a valid URL.`,
          }),
        ],
  );

  return [...nonEmptyIssues, ...urlIssues];
}

export function createDevplatConfig(input: DevplatConfig): DevplatConfig {
  const issues = validateDevplatConfig(input);
  if (issues.length > 0) {
    throw new Error(
      `Runtime configuration is invalid: ${issues
        .map((issue) => `${issue.field} ${issue.message}`)
        .join('; ')}`,
    );
  }

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
  const storageRoot = readEnvValue(
    env,
    'DEVPLAT_STORAGE_ROOT',
    'devplat-state',
  );

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
    github: {
      apiBaseUrl: readEnvUrl(
        env,
        'GITHUB_API_BASE_URL',
        'https://api.github.com',
      ),
      webBaseUrl: readEnvUrl(env, 'GITHUB_WEB_BASE_URL', 'https://github.com'),
      tokenEnvironmentVariable: readEnvValue(
        env,
        'GITHUB_TOKEN_ENV',
        'GITHUB_TOKEN',
      ),
    },
    storage: {
      rootDirectory: storageRoot,
      layoutVersion: 1,
      artifactDirectory: readEnvValue(
        env,
        'DEVPLAT_ARTIFACT_DIRECTORY',
        `${storageRoot}/artifacts`,
      ),
      indexDirectory: readEnvValue(
        env,
        'DEVPLAT_INDEX_DIRECTORY',
        `${storageRoot}/indexes`,
      ),
      auditLogDirectory: readEnvValue(
        env,
        'DEVPLAT_AUDIT_LOG_DIRECTORY',
        `${storageRoot}/audit`,
      ),
    },
    worktrees: {
      rootDirectory: readEnvValue(
        env,
        'DEVPLAT_WORKTREE_ROOT',
        `${storageRoot}/worktrees`,
      ),
      baseBranch: defaultBranch,
      syncStrategy: 'rebase-or-fast-forward',
    },
    deployment: {
      target: readDeploymentTarget(env),
      dockerImageRepository: readEnvValue(
        env,
        'DEVPLAT_DOCKER_IMAGE_REPOSITORY',
        'ghcr.io/vannadii/devplat-openclaw-runtime',
      ),
      dockerImageTag: readEnvValue(env, 'DEVPLAT_DOCKER_IMAGE_TAG', 'latest'),
      helmReleaseName: readEnvValue(env, 'DEVPLAT_HELM_RELEASE', 'devplat'),
      helmNamespace: readEnvValue(env, 'DEVPLAT_HELM_NAMESPACE', 'devplat'),
      helmChartPath: readEnvValue(
        env,
        'DEVPLAT_HELM_CHART_PATH',
        'deploy/helm/devplat',
      ),
      stateMountPath: readEnvValue(
        env,
        'DEVPLAT_STATE_MOUNT_PATH',
        '/var/lib/devplat',
      ),
    },
    discord: {
      apiBaseUrl: readEnvUrl(
        env,
        'DISCORD_API_BASE_URL',
        'https://discord.com/api/v10',
      ),
      apiVersion: 'v10',
      applicationId: requireEnvValue(env, 'DISCORD_APPLICATION_ID'),
      categoryName: readEnvValue(env, 'DISCORD_CATEGORY_NAME', githubRepo),
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
