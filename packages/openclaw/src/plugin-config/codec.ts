import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const OpenClawPluginConfigDiscordInstallScopeCodec = t.union([
  t.literal('bot'),
  t.literal('applications.commands'),
]);

export const OpenClawPluginConfigDiscordPermissionCodec = t.union([
  t.literal('ViewChannel'),
  t.literal('SendMessages'),
  t.literal('CreatePublicThreads'),
  t.literal('CreatePrivateThreads'),
  t.literal('SendMessagesInThreads'),
  t.literal('ManageThreads'),
  t.literal('ReadMessageHistory'),
]);

export const OpenClawPluginConfigCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
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
