import * as t from 'io-ts';

import {
  DevplatErrorSeverityCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

export const DiscordApiVersionCodec = t.literal('v10');

export const DiscordInstallScopeCodec = t.union([
  t.literal('bot'),
  t.literal('applications.commands'),
]);

export const DiscordPermissionCodec = t.union([
  t.literal('ViewChannel'),
  t.literal('SendMessages'),
  t.literal('CreatePublicThreads'),
  t.literal('CreatePrivateThreads'),
  t.literal('SendMessagesInThreads'),
  t.literal('ManageThreads'),
  t.literal('ReadMessageHistory'),
]);

export const RepositoryRuntimeConfigCodec = t.type({
  owner: t.string,
  repo: t.string,
  defaultBranch: t.string,
  repositoryKey: t.string,
});

export const GitHubRuntimeConfigCodec = t.type({
  apiBaseUrl: t.string,
  webBaseUrl: t.string,
  tokenEnvironmentVariable: t.string,
});

export const StorageRuntimeConfigCodec = t.type({
  rootDirectory: t.string,
  layoutVersion: t.literal(1),
  artifactDirectory: t.string,
  indexDirectory: t.string,
  auditLogDirectory: t.string,
});

export const WorktreeRuntimeConfigCodec = t.type({
  rootDirectory: t.string,
  baseBranch: t.string,
  syncStrategy: t.literal('rebase-or-fast-forward'),
});

export const DeploymentTargetCodec = t.union([
  t.literal('local-docker'),
  t.literal('kubernetes'),
]);

export const DeploymentRuntimeConfigCodec = t.type({
  target: DeploymentTargetCodec,
  dockerImageRepository: t.string,
  dockerImageTag: t.string,
  helmReleaseName: t.string,
  helmNamespace: t.string,
  helmChartPath: t.string,
  stateMountPath: t.string,
});

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
});

export const OpenClawGatewayConfigCodec = t.type({
  bind: t.literal('loopback'),
  port: t.number,
  authMode: t.literal('token'),
});

export const OpenClawActionGateConfigCodec = t.type({
  approveThis: t.boolean,
  mergeNow: t.boolean,
  retryGates: t.boolean,
  rebaseAllDependents: t.boolean,
});

export const RuntimeConfigValidationIssueCodec = t.type({
  field: t.string,
  code: t.string,
  message: t.string,
  severity: DevplatErrorSeverityCodec,
});

export const DevplatConfigCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
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
