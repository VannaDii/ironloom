import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

/** Codec for open claw plugin config discord install scope. */
export const OpenClawPluginConfigDiscordInstallScopeCodec = t.union([
  t.literal('bot'),
  t.literal('applications.commands'),
]);

/** Codec for open claw plugin config discord permission. */
export const OpenClawPluginConfigDiscordPermissionCodec = t.union([
  t.literal('ViewChannel'),
  t.literal('SendMessages'),
  t.literal('CreatePublicThreads'),
  t.literal('CreatePrivateThreads'),
  t.literal('SendMessagesInThreads'),
  t.literal('ManageThreads'),
  t.literal('ReadMessageHistory'),
]);

/** Codec for open claw plugin config. */
export const OpenClawPluginConfigCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  apiBaseUrl: t.string,
  apiVersion: t.literal('v10'),
  applicationId: t.string,
  categoryName: t.string,
  publicKey: t.string,
  botToken: t.string,
  installScopes: t.readonlyArray(OpenClawPluginConfigDiscordInstallScopeCodec),
  requiredPermissions: t.readonlyArray(
    OpenClawPluginConfigDiscordPermissionCodec,
  ),
  defaultGuildId: t.string,
  specChannelId: t.string,
  implementationChannelId: t.string,
  pullRequestChannelId: t.string,
  auditChannelId: t.string,
  projectManagementChannelId: t.string,
  threadBindingMode: t.literal('inherit-parent'),
  actionGates: t.type({
    approveThis: t.boolean,
    mergeNow: t.boolean,
    retryGates: t.boolean,
    rebaseAllDependents: t.boolean,
  }),
});

/** Discord OAuth install scope required by the OpenClaw plugin. */
export type OpenClawPluginConfigDiscordInstallScope = t.TypeOf<
  typeof OpenClawPluginConfigDiscordInstallScopeCodec
>;

/** Discord permission required by the OpenClaw plugin. */
export type OpenClawPluginConfigDiscordPermission = t.TypeOf<
  typeof OpenClawPluginConfigDiscordPermissionCodec
>;

/** Runtime plugin configuration loaded for OpenClaw. */
export type OpenClawPluginConfig = t.TypeOf<typeof OpenClawPluginConfigCodec>;
