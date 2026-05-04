import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { OpenClawPluginConfigCodec } from './codec.js';

describe('OpenClaw plugin config codecs', () => {
  const cases = [
    {
      name: 'decode valid plugin config timestamps',
      inputs: {
        config: {
          id: 'plugin-1',
          summary: 'Plugin config.',
          status: 'running',
          trace: ['loaded'],
          updatedAt: '2026-04-04T00:00:00.000Z',
          apiBaseUrl: 'https://discord.com/api',
          apiVersion: 'v10',
          applicationId: 'app-1',
          categoryName: 'devplat',
          publicKey: 'public-key',
          botToken: 'bot-token',
          installScopes: ['bot', 'applications.commands'],
          requiredPermissions: ['ViewChannel', 'SendMessages'],
          defaultGuildId: 'guild-1',
          specChannelId: 'spec-channel',
          implementationChannelId: 'implementation-channel',
          pullRequestChannelId: 'pull-request-channel',
          auditChannelId: 'audit-channel',
          projectManagementChannelId: 'project-channel',
          threadBindingMode: 'inherit-parent',
          actionGates: {
            approveThis: true,
            mergeNow: true,
            retryGates: true,
            rebaseAllDependents: true,
          },
        },
      },
      mock: ({ config }) => decodeWithCodec(OpenClawPluginConfigCodec, config),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid plugin config timestamps',
      inputs: {
        config: {
          id: 'plugin-1',
          summary: 'Plugin config.',
          status: 'running',
          trace: ['loaded'],
          updatedAt: 'April 4, 2026',
          apiBaseUrl: 'https://discord.com/api',
          apiVersion: 'v10',
          applicationId: 'app-1',
          categoryName: 'devplat',
          publicKey: 'public-key',
          botToken: 'bot-token',
          installScopes: ['bot', 'applications.commands'],
          requiredPermissions: ['ViewChannel', 'SendMessages'],
          defaultGuildId: 'guild-1',
          specChannelId: 'spec-channel',
          implementationChannelId: 'implementation-channel',
          pullRequestChannelId: 'pull-request-channel',
          auditChannelId: 'audit-channel',
          projectManagementChannelId: 'project-channel',
          threadBindingMode: 'inherit-parent',
          actionGates: {
            approveThis: true,
            mergeNow: true,
            retryGates: true,
            rebaseAllDependents: true,
          },
        },
      },
      mock: ({ config }) => decodeWithCodec(OpenClawPluginConfigCodec, config),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    const outcome = testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
