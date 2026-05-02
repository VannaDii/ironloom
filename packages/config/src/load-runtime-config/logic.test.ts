import { describe, expect, it } from 'vitest';

import { TRAILING_URL_SLASH_PATTERN } from './constants.js';
import {
  createDevplatConfig,
  createDefaultDevplatConfig,
  describeDevplatConfig,
  validateDevplatConfig,
} from './logic.js';

describe('DevplatConfig logic', () => {
  const cases = [
    {
      name: 'creates a default config from environment overrides',
      inputs: {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          GITHUB_DEFAULT_BRANCH: 'trunk',
          DEVPLAT_STORAGE_ROOT: 'state/devplat',
          DEVPLAT_WORKTREE_ROOT: 'state/worktrees',
          DEVPLAT_DEPLOYMENT_TARGET: 'kubernetes',
          DEVPLAT_DOCKER_IMAGE_REPOSITORY: 'ghcr.io/acme/devplat-runtime',
          DEVPLAT_DOCKER_IMAGE_TAG: 'sha-abc123',
          DEVPLAT_HELM_RELEASE: 'acme-devplat',
          DEVPLAT_HELM_NAMESPACE: 'automation',
          DEVPLAT_HELM_CHART_PATH: 'deploy/helm/devplat',
          DEVPLAT_STATE_MOUNT_PATH: '/var/lib/acme-devplat',
          OPENCLAW_GATEWAY_PORT: '19000',
          DISCORD_GATEWAY_URL: 'wss://gateway.discord.test/?v=10&encoding=json',
          DISCORD_GATEWAY_INTENTS: '0',
        },
      },
      mock: ({ env }: { env: Record<string, string> }) =>
        createDefaultDevplatConfig(env),
      assert: (config: ReturnType<typeof createDefaultDevplatConfig>) => {
        expect(config.trace).toContain('config:load-runtime-config');
        expect(config.discord.apiBaseUrl).toBe('https://discord.com/api/v10');
        expect(config.discord.apiVersion).toBe('v10');
        expect(config.discord.categoryName).toBe('devplat');
        expect(config.discord.installScopes).toEqual([
          'bot',
          'applications.commands',
        ]);
        expect(config.discord.requiredPermissions).toEqual([
          'ViewChannel',
          'SendMessages',
          'CreatePublicThreads',
          'CreatePrivateThreads',
          'SendMessagesInThreads',
          'ManageThreads',
          'ReadMessageHistory',
        ]);
        expect(config.discord.defaultGuildId).toBe('devplat-guild');
        expect(config.repository).toEqual({
          owner: 'VannaDii',
          repo: 'devplat',
          defaultBranch: 'trunk',
          repositoryKey: 'VannaDii/devplat',
        });
        expect(config.github).toEqual({
          apiBaseUrl: 'https://api.github.com',
          webBaseUrl: 'https://github.com',
          tokenEnvironmentVariable: 'GITHUB_TOKEN',
        });
        expect(config.storage).toEqual({
          rootDirectory: 'state/devplat',
          layoutVersion: 1,
          artifactDirectory: 'state/devplat/artifacts',
          indexDirectory: 'state/devplat/indexes',
          auditLogDirectory: 'state/devplat/audit',
        });
        expect(config.worktrees).toEqual({
          rootDirectory: 'state/worktrees',
          baseBranch: 'trunk',
          syncStrategy: 'rebase-or-fast-forward',
        });
        expect(config.deployment).toEqual({
          target: 'kubernetes',
          dockerImageRepository: 'ghcr.io/acme/devplat-runtime',
          dockerImageTag: 'sha-abc123',
          helmReleaseName: 'acme-devplat',
          helmNamespace: 'automation',
          helmChartPath: 'deploy/helm/devplat',
          stateMountPath: '/var/lib/acme-devplat',
        });
        expect(config.openclaw.gateway).toEqual({
          bind: 'loopback',
          port: 19000,
          authMode: 'token',
        });
        expect(config.discord.pullRequestChannelId).toBe(
          'pull-request-channel',
        );
        expect(config.discord.projectManagementChannelId).toBe(
          'project-management-channel',
        );
        expect(config.discord.threadBindingMode).toBe('inherit-parent');
        expect(config.discord.interactionTransport).toBe('gateway');
        expect(config.discord.gatewayUrl).toBe(
          'wss://gateway.discord.test/?v=10&encoding=json',
        );
        expect(config.discord.gatewayIntents).toBe(0);
        expect(config.sonar.minimumCoverage).toBe(90);
        expect(validateDevplatConfig(config)).toEqual([]);
        expect(describeDevplatConfig(config)).toContain('VannaDii/devplat');
      },
    },
    {
      name: 'rejects invalid Discord Gateway intents',
      inputs: {
        env: {
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DISCORD_GATEWAY_INTENTS: '-1',
        },
      },
      mock:
        ({ env }: { env: Record<string, string> }) =>
        () =>
          createDefaultDevplatConfig(env),
      assert: (
        createConfig: () => ReturnType<typeof createDefaultDevplatConfig>,
      ) => {
        expect(createConfig).toThrow(
          'DISCORD_GATEWAY_INTENTS must be a non-negative integer.',
        );
      },
    },
    {
      name: 'rejects invalid OpenClaw gateway ports',
      inputs: {
        env: {
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          OPENCLAW_GATEWAY_PORT: 'zero',
        },
      },
      mock:
        ({ env }: { env: Record<string, string> }) =>
        () =>
          createDefaultDevplatConfig(env),
      assert: (
        createConfig: () => ReturnType<typeof createDefaultDevplatConfig>,
      ) => {
        expect(createConfig).toThrow(
          'OPENCLAW_GATEWAY_PORT must be a positive integer.',
        );
      },
    },
    {
      name: 'rejects invalid URL overrides',
      inputs: {
        env: {
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          GITHUB_API_BASE_URL: 'github.invalid',
        },
      },
      mock:
        ({ env }: { env: Record<string, string> }) =>
        () =>
          createDefaultDevplatConfig(env),
      assert: (
        createConfig: () => ReturnType<typeof createDefaultDevplatConfig>,
      ) => {
        expect(createConfig).toThrow(
          'GITHUB_API_BASE_URL must be a valid URL.',
        );
      },
    },
    {
      name: 'rejects invalid deployment target overrides',
      inputs: {
        env: {
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DEVPLAT_DEPLOYMENT_TARGET: 'serverless',
        },
      },
      mock:
        ({ env }: { env: Record<string, string> }) =>
        () =>
          createDefaultDevplatConfig(env),
      assert: (
        createConfig: () => ReturnType<typeof createDefaultDevplatConfig>,
      ) => {
        expect(createConfig).toThrow(
          'DEVPLAT_DEPLOYMENT_TARGET must be local-docker or kubernetes.',
        );
      },
    },
    {
      name: 'requires Discord credentials to be present',
      inputs: {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
        },
      },
      mock:
        ({ env }: { env: Record<string, string> }) =>
        () =>
          createDefaultDevplatConfig(env),
      assert: (
        createConfig: () => ReturnType<typeof createDefaultDevplatConfig>,
      ) => {
        expect(createConfig).toThrow(
          'DISCORD_APPLICATION_ID must be set for Discord runtime configuration.',
        );
      },
    },
    {
      name: 'returns structured validation issues for normalized config gaps',
      inputs: {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
        },
      },
      mock: ({ env }: { env: Record<string, string> }) => {
        const config = createDefaultDevplatConfig(env);
        return validateDevplatConfig({
          ...config,
          github: {
            ...config.github,
            apiBaseUrl: 'not-a-url',
          },
          deployment: {
            ...config.deployment,
            helmNamespace: '   ',
          },
        });
      },
      assert: (issues: ReturnType<typeof validateDevplatConfig>) => {
        expect(issues).toEqual([
          {
            field: 'deployment.helmNamespace',
            code: 'config.empty-value',
            message: 'deployment.helmNamespace must not be empty.',
            severity: 'error',
          },
          {
            field: 'github.apiBaseUrl',
            code: 'config.invalid-url',
            message: 'github.apiBaseUrl must be a valid URL.',
            severity: 'error',
          },
        ]);
      },
    },
    {
      name: 'rejects normalized config with validation issues',
      inputs: {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
        },
      },
      mock:
        ({ env }: { env: Record<string, string> }) =>
        () => {
          const config = createDefaultDevplatConfig(env);
          return createDevplatConfig({
            ...config,
            github: {
              ...config.github,
              webBaseUrl: 'invalid-web-url',
            },
          });
        },
      assert: (createConfig: () => ReturnType<typeof createDevplatConfig>) => {
        expect(createConfig).toThrow(
          'Runtime configuration is invalid: github.webBaseUrl github.webBaseUrl must be a valid URL.',
        );
      },
    },
    {
      name: 'keeps trailing URL slash normalization explicit and tested',
      inputs: {
        urlsWithTrailingSlash: [
          'https://api.github.com/',
          'https://discord.com/api/v10/',
        ],
        urlsWithoutTrailingSlash: [
          'https://api.github.com',
          'https://discord.com/api/v10',
        ],
      },
      mock: (inputs: {
        urlsWithTrailingSlash: string[];
        urlsWithoutTrailingSlash: string[];
      }) => inputs,
      assert: (inputs: {
        urlsWithTrailingSlash: string[];
        urlsWithoutTrailingSlash: string[];
      }) => {
        for (const url of inputs.urlsWithTrailingSlash) {
          expect(TRAILING_URL_SLASH_PATTERN.test(url)).toBe(true);
        }

        for (const url of inputs.urlsWithoutTrailingSlash) {
          expect(TRAILING_URL_SLASH_PATTERN.test(url)).toBe(false);
        }
      },
    },
  ];

  it.each(cases)('$name', ({ inputs, mock, assert }) => {
    assert(mock(inputs));
  });
});
