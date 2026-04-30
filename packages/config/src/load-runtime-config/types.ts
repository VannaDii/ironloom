import type * as t from 'io-ts';

import type {
  DevplatConfigCodec,
  DiscordApiVersionCodec,
  DiscordInstallScopeCodec,
  DiscordPermissionCodec,
  DiscordRuntimeConfigCodec,
  OpenClawActionGateConfigCodec,
  OpenClawGatewayConfigCodec,
  RepositoryRuntimeConfigCodec,
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

export type StorageRuntimeConfig = t.TypeOf<typeof StorageRuntimeConfigCodec>;

export type WorktreeRuntimeConfig = t.TypeOf<typeof WorktreeRuntimeConfigCodec>;

export type OpenClawGatewayConfig = t.TypeOf<typeof OpenClawGatewayConfigCodec>;

export type OpenClawActionGateConfig = t.TypeOf<
  typeof OpenClawActionGateConfigCodec
>;

export type DevplatConfig = t.TypeOf<typeof DevplatConfigCodec>;
