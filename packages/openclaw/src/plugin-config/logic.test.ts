import { describe, expect, it } from 'vitest';

import type { DevplatConfig } from '@vannadii/devplat-config';

import {
  createOpenClawPluginConfig,
  createOpenClawPluginConfigFromRuntimeConfig,
  describeOpenClawPluginConfig,
} from './logic.js';
import type { OpenClawPluginConfig } from './codec.js';

type OpenClawPluginConfigLogicInputs =
  | {
      mode: 'plugin';
      config: OpenClawPluginConfig;
    }
  | {
      mode: 'runtime';
      config: DevplatConfig;
    };

type OpenClawPluginConfigLogicCase = {
  name: string;
  inputs: OpenClawPluginConfigLogicInputs;
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: OpenClawPluginConfigLogicInputs,
  ) => void;
};

describe('OpenClawPluginConfig logic', () => {
  const cases = [
    {
      name: 'normalizes plugin config and appends a trace marker',
      inputs: {
        mode: 'plugin',
        config: {
          id: 'openclaw-config',
          summary: '  OpenClaw adapter layer for DevPlat.  ',
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
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'plugin') {
          throw new Error('expected plugin inputs');
        }

        const config = createOpenClawPluginConfig(inputs.config);

        expect(config.trace).toContain('openclaw:plugin-config');
        expect(describeOpenClawPluginConfig(config)).toContain('guild-1');
      },
    },
    {
      name: 'builds plugin config from runtime config without losing thread binding policy',
      inputs: {
        mode: 'runtime',
        config: {
          id: 'runtime-config',
          summary: 'Runtime config',
          status: 'approved',
          trace: ['config:load-runtime-config'],
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
            applicationId: 'application-9',
            categoryName: 'devplat',
            publicKey: 'public-key-9',
            botToken: 'bot-token-9',
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
            defaultGuildId: 'guild-9',
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
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'runtime') {
          throw new Error('expected runtime inputs');
        }

        const config = createOpenClawPluginConfigFromRuntimeConfig(
          inputs.config,
        );

        expect(config.id).toBe('@vannadii/devplat-openclaw:config');
        expect(config.apiVersion).toBe('v10');
        expect(config.categoryName).toBe('devplat');
        expect(config.pullRequestChannelId).toBe('prs');
        expect(config.projectManagementChannelId).toBe('pm');
        expect(config.threadBindingMode).toBe('inherit-parent');
        expect(config.trace).toContain('openclaw:plugin-config');
      },
    },
  ] satisfies OpenClawPluginConfigLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
