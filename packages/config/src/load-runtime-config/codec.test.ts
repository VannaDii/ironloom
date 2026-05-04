import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { DevplatConfigCodec } from './codec.js';

const validConfig = {
  id: 'config-1',
  summary: 'Runtime config.',
  status: 'complete',
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
    rootDirectory: 'devplat-state',
    layoutVersion: 1,
    artifactDirectory: 'devplat-state/artifacts',
    indexDirectory: 'devplat-state/indexes',
    auditLogDirectory: 'devplat-state/audit',
  },
  worktrees: {
    rootDirectory: 'devplat-state/worktrees',
    baseBranch: 'main',
    syncStrategy: 'rebase-or-fast-forward',
  },
  deployment: {
    target: 'local-docker',
    dockerImageRepository: 'ghcr.io/vannadii/devplat/openclaw-runtime',
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
    requiredPermissions: ['ViewChannel', 'SendMessages'],
    defaultGuildId: 'guild-1',
    specChannelId: 'spec-channel',
    implementationChannelId: 'implementation-channel',
    pullRequestChannelId: 'pull-request-channel',
    auditChannelId: 'audit-channel',
    projectManagementChannelId: 'project-management-channel',
    threadBindingMode: 'inherit-parent',
    interactionTransport: 'gateway',
    gatewayUrl: 'wss://gateway.discord.gg/?v=10&encoding=json',
    gatewayIntents: 0,
  },
  openclaw: {
    pluginId: '@vannadii/devplat-openclaw',
    gateway: {
      bind: 'loopback',
      port: 17331,
      authMode: 'token',
    },
    actionGates: {
      approveThis: true,
      mergeNow: true,
      retryGates: true,
      rebaseAllDependents: true,
    },
  },
  sonar: {
    organization: 'vannadii',
    projectKey: 'vannadii_devplat',
    minimumCoverage: 90,
  },
};

describe('runtime config codecs', () => {
  const cases = [
    {
      name: 'decode valid runtime config payloads',
      inputs: {
        value: validConfig,
      },
      mock: async ({ value }) => decodeWithCodec(DevplatConfigCodec, value),
      assert: (decoded) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid runtime config identifiers and timestamps',
      inputs: {
        values: [
          {
            ...validConfig,
            updatedAt: 'April 4, 2026',
          },
          {
            ...validConfig,
            repository: {
              ...validConfig.repository,
              defaultBranch: 'bad branch',
            },
          },
          {
            ...validConfig,
            repository: {
              ...validConfig.repository,
              repositoryKey: 'VannaDii',
            },
          },
          {
            ...validConfig,
            worktrees: {
              ...validConfig.worktrees,
              baseBranch: '-bad',
            },
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) => decodeWithCodec(DevplatConfigCodec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
