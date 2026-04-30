import type * as t from 'io-ts';

import type {
  OpenClawPluginConfigCodec,
  OpenClawPluginConfigDiscordInstallScopeCodec,
  OpenClawPluginConfigDiscordPermissionCodec,
} from './codec.js';

export type OpenClawPluginConfigDiscordInstallScope = t.TypeOf<
  typeof OpenClawPluginConfigDiscordInstallScopeCodec
>;

export type OpenClawPluginConfigDiscordPermission = t.TypeOf<
  typeof OpenClawPluginConfigDiscordPermissionCodec
>;

export type OpenClawPluginConfig = t.TypeOf<typeof OpenClawPluginConfigCodec>;
