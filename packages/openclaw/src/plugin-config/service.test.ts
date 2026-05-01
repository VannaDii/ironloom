import { describe, expect, it } from 'vitest';

import type { DevplatConfig } from '@vannadii/devplat-config';

import { PluginConfigService } from './service.js';
import type { OpenClawPluginConfig } from './types.js';

type PluginConfigServiceInputs =
  | {
      mode: 'execute';
      config: OpenClawPluginConfig;
    }
  | {
      mode: 'runtime';
      config: DevplatConfig;
    };

type PluginConfigServiceCase = {
  name: string;
  inputs: PluginConfigServiceInputs;
  mock: () => {
    service: PluginConfigService;
  };
  assert: (
    context: { service: PluginConfigService },
    inputs: PluginConfigServiceInputs,
  ) => void;
};

describe('PluginConfigService', () => {
  const cases = [
    {
      name: 'delegates to the unit logic',
      inputs: {
        mode: 'execute',
        config: {
          id: 'openclaw-config',
          summary: 'OpenClaw adapter layer for DevPlat.',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          apiBaseUrl: 'https://discord.com/api/v10',
          apiVersion: 'v10',
          applicationId: 'application-1',
          categoryName: 'devplat',
          publicKey: 'public-key-1',
          botToken: 'bot-token-1',
          installScopes: ['bot', 'applications.commands'],
          requiredPermissions: [
            'ViewChannel',
            'SendMessages',
            'CreatePublicThreads',
            'CreatePrivateThreads',
            'SendMessagesInThreads',
            'ManageThreads',
            'ReadMessageHistory',
          ],
          defaultGuildId: 'guild-1',
          specChannelId: 'specs',
          implementationChannelId: 'impl',
          pullRequestChannelId: 'prs',
          auditChannelId: 'audit',
          projectManagementChannelId: 'pm',
          threadBindingMode: 'inherit-parent',
          actionGates: {
            approveThis: true,
            mergeNow: false,
            retryGates: true,
            rebaseAllDependents: false,
          },
        },
      },
      mock: () => ({
        service: new PluginConfigService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute') {
          throw new Error('expected execute inputs');
        }

        const config = context.service.execute(inputs.config);

        expect(config.trace).toContain('openclaw:plugin-config');
        expect(context.service.explain(config)).toContain('guild-1:specs');
      },
    },
    {
      name: 'derives OpenClaw config from runtime config',
      inputs: {
        mode: 'runtime',
        config: {
          id: 'devplat-config',
          summary: 'Resolved DevPlat runtime configuration',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          githubOwner: 'VannaDii',
          githubRepo: 'devplat',
          repository: {
            owner: 'VannaDii',
            repo: 'devplat',
            defaultBranch: 'main',
            repositoryKey: 'VannaDii/devplat',
          },
          github: {
            apiBaseUrl: 'https://api.github.com',
            webBaseUrl: 'https://github.com',
            tokenEnvironmentVariable: 'GITHUB_TOKEN',
          },
          storage: {
            rootDirectory: '.devplat',
            layoutVersion: 1,
            artifactDirectory: '.devplat/artifacts',
            indexDirectory: '.devplat/indexes',
            auditLogDirectory: '.devplat/audit',
          },
          worktrees: {
            rootDirectory: '.devplat/worktrees',
            baseBranch: 'main',
            syncStrategy: 'rebase-or-fast-forward',
          },
          deployment: {
            target: 'local-docker',
            dockerImageRepository: 'ghcr.io/vannadii/devplat-openclaw-runtime',
            dockerImageTag: 'latest',
            helmReleaseName: 'devplat',
            helmNamespace: 'devplat',
            helmChartPath: 'deploy/helm/devplat',
            stateMountPath: '/var/lib/devplat',
          },
          discord: {
            apiBaseUrl: 'https://discord.com/api/v10',
            apiVersion: 'v10',
            applicationId: 'application-1',
            categoryName: 'devplat',
            publicKey: 'public-key-1',
            botToken: 'bot-token-1',
            installScopes: ['bot', 'applications.commands'],
            requiredPermissions: [
              'ViewChannel',
              'SendMessages',
              'CreatePublicThreads',
              'CreatePrivateThreads',
              'SendMessagesInThreads',
              'ManageThreads',
              'ReadMessageHistory',
            ],
            defaultGuildId: 'guild-1',
            specChannelId: 'specs',
            implementationChannelId: 'impl',
            pullRequestChannelId: 'prs',
            auditChannelId: 'audit',
            projectManagementChannelId: 'pm',
            threadBindingMode: 'inherit-parent',
          },
          openclaw: {
            pluginId: '@vannadii/devplat-openclaw',
            gateway: {
              bind: 'loopback',
              port: 18789,
              authMode: 'token',
            },
            actionGates: {
              approveThis: true,
              mergeNow: false,
              retryGates: true,
              rebaseAllDependents: false,
            },
          },
          sonar: {
            organization: 'VannaDii',
            projectKey: 'vannadii_devplat',
            minimumCoverage: 90,
          },
        },
      },
      mock: () => ({
        service: new PluginConfigService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'runtime') {
          throw new Error('expected runtime inputs');
        }

        const config = context.service.fromRuntimeConfig(inputs.config);

        expect(config.defaultGuildId).toBe('guild-1');
        expect(config.apiVersion).toBe('v10');
        expect(config.projectManagementChannelId).toBe('pm');
        expect(config.threadBindingMode).toBe('inherit-parent');
      },
    },
  ] satisfies PluginConfigServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
