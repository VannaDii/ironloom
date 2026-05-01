import type { DevplatConfig } from '@vannadii/devplat-config';
import { appendTrace } from '@vannadii/devplat-core';

import type { OpenClawPluginConfig } from './codec.js';

export function createOpenClawPluginConfig(
  input: OpenClawPluginConfig,
): OpenClawPluginConfig {
  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    'openclaw:plugin-config',
  );
}

export function describeOpenClawPluginConfig(
  input: OpenClawPluginConfig,
): string {
  return `${input.defaultGuildId}:${input.specChannelId} -> ${input.summary}`;
}

export function createOpenClawPluginConfigFromRuntimeConfig(
  input: DevplatConfig,
): OpenClawPluginConfig {
  return createOpenClawPluginConfig({
    id: `${input.openclaw.pluginId}:config`,
    summary: `OpenClaw configuration for ${input.githubOwner}/${input.githubRepo}`,
    status: input.status,
    trace: input.trace,
    updatedAt: input.updatedAt,
    apiBaseUrl: input.discord.apiBaseUrl,
    apiVersion: input.discord.apiVersion,
    applicationId: input.discord.applicationId,
    categoryName: input.discord.categoryName,
    publicKey: input.discord.publicKey,
    botToken: input.discord.botToken,
    installScopes: input.discord.installScopes,
    requiredPermissions: input.discord.requiredPermissions,
    defaultGuildId: input.discord.defaultGuildId,
    specChannelId: input.discord.specChannelId,
    implementationChannelId: input.discord.implementationChannelId,
    pullRequestChannelId: input.discord.pullRequestChannelId,
    auditChannelId: input.discord.auditChannelId,
    projectManagementChannelId: input.discord.projectManagementChannelId,
    threadBindingMode: input.discord.threadBindingMode,
    actionGates: input.openclaw.actionGates,
  });
}
