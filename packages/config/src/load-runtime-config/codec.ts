import * as t from 'io-ts';

import {
  DevplatErrorSeverityCodec,
  GitBranchNameCodec,
  IsoTimestampCodec,
  LifecycleStatusCodec,
  RepositoryKeyCodec,
} from '@vannadii/devplat-core';

/**
 * Codec for the supported Discord REST API version.
 */
export const DiscordApiVersionCodec = t.literal('v10');

/**
 * Codec for Discord OAuth install scopes required by DevPlat.
 */
export const DiscordInstallScopeCodec = t.union([
  t.literal('bot'),
  t.literal('applications.commands'),
]);

/**
 * Codec for Discord bot permissions required by DevPlat.
 */
export const DiscordPermissionCodec = t.union([
  t.literal('ViewChannel'),
  t.literal('SendMessages'),
  t.literal('CreatePublicThreads'),
  t.literal('CreatePrivateThreads'),
  t.literal('SendMessagesInThreads'),
  t.literal('ManageThreads'),
  t.literal('ReadMessageHistory'),
]);

/**
 * Codec for the supported Discord interaction transport.
 */
export const DiscordInteractionTransportCodec = t.literal('gateway');

/**
 * Codec for repository identity and default branch runtime configuration.
 */
export const RepositoryRuntimeConfigCodec = t.type({
  owner: t.string,
  repo: t.string,
  defaultBranch: GitBranchNameCodec,
  repositoryKey: RepositoryKeyCodec,
});

/**
 * Codec for GitHub API and web endpoint runtime configuration.
 */
export const GitHubRuntimeConfigCodec = t.type({
  apiBaseUrl: t.string,
  webBaseUrl: t.string,
  tokenEnvironmentVariable: t.string,
});

/**
 * Codec for DevPlat storage layout runtime configuration.
 */
export const StorageRuntimeConfigCodec = t.type({
  rootDirectory: t.string,
  layoutVersion: t.literal(1),
  artifactDirectory: t.string,
  indexDirectory: t.string,
  auditLogDirectory: t.string,
});

/**
 * Codec for Git worktree runtime configuration.
 */
export const WorktreeRuntimeConfigCodec = t.type({
  rootDirectory: t.string,
  baseBranch: GitBranchNameCodec,
  syncStrategy: t.literal('rebase-or-fast-forward'),
});

/**
 * Codec for supported runtime deployment targets.
 */
export const DeploymentTargetCodec = t.union([
  t.literal('local-docker'),
  t.literal('kubernetes'),
]);

/**
 * Codec for Docker and Helm deployment runtime configuration.
 */
export const DeploymentRuntimeConfigCodec = t.type({
  target: DeploymentTargetCodec,
  dockerImageRepository: t.string,
  dockerImageTag: t.string,
  helmReleaseName: t.string,
  helmNamespace: t.string,
  helmChartPath: t.string,
  stateMountPath: t.string,
});

/**
 * Codec for Discord runtime configuration.
 */
export const DiscordRuntimeConfigCodec = t.type({
  apiBaseUrl: t.string,
  apiVersion: DiscordApiVersionCodec,
  applicationId: t.string,
  categoryName: t.string,
  publicKey: t.string,
  botToken: t.string,
  installScopes: t.readonlyArray(DiscordInstallScopeCodec),
  requiredPermissions: t.readonlyArray(DiscordPermissionCodec),
  defaultGuildId: t.string,
  specChannelId: t.string,
  implementationChannelId: t.string,
  pullRequestChannelId: t.string,
  auditChannelId: t.string,
  projectManagementChannelId: t.string,
  threadBindingMode: t.literal('inherit-parent'),
  interactionTransport: DiscordInteractionTransportCodec,
  gatewayUrl: t.string,
  gatewayIntents: t.number,
});

/**
 * Codec for the private OpenClaw gateway runtime configuration.
 */
export const OpenClawGatewayConfigCodec = t.type({
  bind: t.literal('loopback'),
  port: t.number,
  authMode: t.literal('token'),
});

/**
 * Codec for OpenClaw action-gate runtime toggles.
 */
export const OpenClawActionGateConfigCodec = t.type({
  approveThis: t.boolean,
  mergeNow: t.boolean,
  retryGates: t.boolean,
  rebaseAllDependents: t.boolean,
});

/**
 * Codec for structured runtime configuration validation issues.
 */
export const RuntimeConfigValidationIssueCodec = t.type({
  field: t.string,
  code: t.string,
  message: t.string,
  severity: DevplatErrorSeverityCodec,
});

/**
 * Codec for complete DevPlat runtime configuration.
 */
export const DevplatConfigCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  githubOwner: t.string,
  githubRepo: t.string,
  repository: RepositoryRuntimeConfigCodec,
  github: GitHubRuntimeConfigCodec,
  storage: StorageRuntimeConfigCodec,
  worktrees: WorktreeRuntimeConfigCodec,
  deployment: DeploymentRuntimeConfigCodec,
  discord: DiscordRuntimeConfigCodec,
  openclaw: t.type({
    pluginId: t.string,
    gateway: OpenClawGatewayConfigCodec,
    actionGates: OpenClawActionGateConfigCodec,
  }),
  sonar: t.type({
    organization: t.string,
    projectKey: t.string,
    minimumCoverage: t.literal(90),
  }),
});

/** Discord REST API version supported by DevPlat. */
export type DiscordApiVersion = t.TypeOf<typeof DiscordApiVersionCodec>;

/** Discord OAuth install scope required by DevPlat. */
export type DiscordInstallScope = t.TypeOf<typeof DiscordInstallScopeCodec>;

/** Discord permission required by DevPlat. */
export type DiscordPermission = t.TypeOf<typeof DiscordPermissionCodec>;

/** Discord interaction transport supported by the private runtime. */
export type DiscordInteractionTransport = t.TypeOf<
  typeof DiscordInteractionTransportCodec
>;

/** Runtime Discord configuration. */
export type DiscordRuntimeConfig = t.TypeOf<typeof DiscordRuntimeConfigCodec>;

/** Repository identity and branch configuration. */
export type RepositoryRuntimeConfig = t.TypeOf<
  typeof RepositoryRuntimeConfigCodec
>;

/** Runtime GitHub API configuration. */
export type GitHubRuntimeConfig = t.TypeOf<typeof GitHubRuntimeConfigCodec>;

/** Runtime storage layout configuration. */
export type StorageRuntimeConfig = t.TypeOf<typeof StorageRuntimeConfigCodec>;

/** Runtime worktree allocation configuration. */
export type WorktreeRuntimeConfig = t.TypeOf<typeof WorktreeRuntimeConfigCodec>;

/** Supported deployment target. */
export type DeploymentTarget = t.TypeOf<typeof DeploymentTargetCodec>;

/** Runtime deployment configuration. */
export type DeploymentRuntimeConfig = t.TypeOf<
  typeof DeploymentRuntimeConfigCodec
>;

/** Runtime OpenClaw gateway configuration. */
export type OpenClawGatewayConfig = t.TypeOf<typeof OpenClawGatewayConfigCodec>;

/** Runtime OpenClaw action gate configuration. */
export type OpenClawActionGateConfig = t.TypeOf<
  typeof OpenClawActionGateConfigCodec
>;

/** Runtime config validation issue. */
export type RuntimeConfigValidationIssue = t.TypeOf<
  typeof RuntimeConfigValidationIssueCodec
>;

/** Complete DevPlat runtime configuration. */
export type DevplatConfig = t.TypeOf<typeof DevplatConfigCodec>;
