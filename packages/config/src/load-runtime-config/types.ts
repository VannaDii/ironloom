import type * as t from 'io-ts';

import type {
  DeploymentRuntimeConfigCodec,
  DeploymentTargetCodec,
  DevplatConfigCodec,
  DiscordApiVersionCodec,
  DiscordInstallScopeCodec,
  DiscordPermissionCodec,
  DiscordRuntimeConfigCodec,
  GitHubRuntimeConfigCodec,
  OpenClawActionGateConfigCodec,
  OpenClawGatewayConfigCodec,
  RepositoryRuntimeConfigCodec,
  RuntimeConfigValidationIssueCodec,
  StorageRuntimeConfigCodec,
  WorktreeRuntimeConfigCodec,
} from './codec.js';

export type DiscordApiVersion = t.TypeOf<typeof DiscordApiVersionCodec>;

export type DiscordInstallScope = t.TypeOf<typeof DiscordInstallScopeCodec>;

export type DiscordPermission = t.TypeOf<typeof DiscordPermissionCodec>;

export type DiscordRuntimeConfig = t.TypeOf<typeof DiscordRuntimeConfigCodec>;

export type RepositoryRuntimeConfig = t.TypeOf<
  typeof RepositoryRuntimeConfigCodec
>;

export type GitHubRuntimeConfig = t.TypeOf<typeof GitHubRuntimeConfigCodec>;

export type StorageRuntimeConfig = t.TypeOf<typeof StorageRuntimeConfigCodec>;

export type WorktreeRuntimeConfig = t.TypeOf<typeof WorktreeRuntimeConfigCodec>;

export type DeploymentTarget = t.TypeOf<typeof DeploymentTargetCodec>;

export type DeploymentRuntimeConfig = t.TypeOf<
  typeof DeploymentRuntimeConfigCodec
>;

export type OpenClawGatewayConfig = t.TypeOf<typeof OpenClawGatewayConfigCodec>;

export type OpenClawActionGateConfig = t.TypeOf<
  typeof OpenClawActionGateConfigCodec
>;

export type RuntimeConfigValidationIssue = t.TypeOf<
  typeof RuntimeConfigValidationIssueCodec
>;

export type DevplatConfig = t.TypeOf<typeof DevplatConfigCodec>;
