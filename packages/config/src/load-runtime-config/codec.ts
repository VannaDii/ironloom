import * as t from 'io-ts';

import { LifecycleStatusCodec, type Exact } from '@vannadii/devplat-core';

import type { DevplatConfig } from './types.js';

const DiscordInstallScopeCodec = t.union([
  t.literal('bot'),
  t.literal('applications.commands'),
]);

const DiscordPermissionCodec = t.union([
  t.literal('ViewChannel'),
  t.literal('SendMessages'),
  t.literal('CreatePublicThreads'),
  t.literal('CreatePrivateThreads'),
  t.literal('SendMessagesInThreads'),
  t.literal('ManageThreads'),
  t.literal('ReadMessageHistory'),
]);

export const DevplatConfigCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  githubOwner: t.string,
  githubRepo: t.string,
  repository: t.type({
    owner: t.string,
    repo: t.string,
    defaultBranch: t.string,
    repositoryKey: t.string,
  }),
  storage: t.type({
    rootDirectory: t.string,
    layoutVersion: t.literal(1),
  }),
  worktrees: t.type({
    rootDirectory: t.string,
    baseBranch: t.string,
  }),
  discord: t.type({
    apiBaseUrl: t.string,
    apiVersion: t.literal('v10'),
    applicationId: t.string,
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
  }),
  openclaw: t.type({
    pluginId: t.string,
    gateway: t.type({
      bind: t.literal('loopback'),
      port: t.number,
      authMode: t.literal('token'),
    }),
    actionGates: t.type({
      approveThis: t.boolean,
      mergeNow: t.boolean,
      retryGates: t.boolean,
      rebaseAllDependents: t.boolean,
    }),
  }),
  sonar: t.type({
    organization: t.string,
    projectKey: t.string,
    minimumCoverage: t.literal(90),
  }),
});

export type _DevplatConfigExact = Exact<
  DevplatConfig,
  t.TypeOf<typeof DevplatConfigCodec>
>;
