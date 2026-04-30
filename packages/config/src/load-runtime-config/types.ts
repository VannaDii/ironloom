import type { LifecycleStatus } from '@vannadii/devplat-core';

export type DiscordApiVersion = 'v10';

export type DiscordInstallScope = 'bot' | 'applications.commands';

export type DiscordPermission =
  | 'ViewChannel'
  | 'SendMessages'
  | 'CreatePublicThreads'
  | 'CreatePrivateThreads'
  | 'SendMessagesInThreads'
  | 'ManageThreads'
  | 'ReadMessageHistory';

export interface DiscordRuntimeConfig {
  apiBaseUrl: string;
  apiVersion: DiscordApiVersion;
  applicationId: string;
  publicKey: string;
  botToken: string;
  installScopes: readonly DiscordInstallScope[];
  requiredPermissions: readonly DiscordPermission[];
  defaultGuildId: string;
  specChannelId: string;
  implementationChannelId: string;
  pullRequestChannelId: string;
  auditChannelId: string;
  projectManagementChannelId: string;
  threadBindingMode: 'inherit-parent';
}

export interface RepositoryRuntimeConfig {
  owner: string;
  repo: string;
  defaultBranch: string;
  repositoryKey: string;
}

export interface StorageRuntimeConfig {
  rootDirectory: string;
  layoutVersion: 1;
}

export interface WorktreeRuntimeConfig {
  rootDirectory: string;
  baseBranch: string;
}

export interface OpenClawGatewayConfig {
  bind: 'loopback';
  port: number;
  authMode: 'token';
}

export interface OpenClawActionGateConfig {
  approveThis: boolean;
  mergeNow: boolean;
  retryGates: boolean;
  rebaseAllDependents: boolean;
}

export interface DevplatConfig {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  githubOwner: string;
  githubRepo: string;
  repository: RepositoryRuntimeConfig;
  storage: StorageRuntimeConfig;
  worktrees: WorktreeRuntimeConfig;
  discord: DiscordRuntimeConfig;
  openclaw: {
    pluginId: string;
    gateway: OpenClawGatewayConfig;
    actionGates: OpenClawActionGateConfig;
  };
  sonar: {
    organization: string;
    projectKey: string;
    minimumCoverage: 90;
  };
}
