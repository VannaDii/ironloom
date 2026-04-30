import { describe, expect, it } from 'vitest';

import { createDefaultDevplatConfig, describeDevplatConfig } from './logic.js';

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
          OPENCLAW_GATEWAY_PORT: '19000',
        },
      },
      mock: ({ env }: { env: Record<string, string> }) =>
        createDefaultDevplatConfig(env),
      assert: (config: ReturnType<typeof createDefaultDevplatConfig>) => {
        expect(config.trace).toContain('config:load-runtime-config');
        expect(config.discord.apiBaseUrl).toBe('https://discord.com/api/v10');
        expect(config.discord.apiVersion).toBe('v10');
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
        expect(config.storage).toEqual({
          rootDirectory: 'state/devplat',
          layoutVersion: 1,
        });
        expect(config.worktrees).toEqual({
          rootDirectory: 'state/worktrees',
          baseBranch: 'trunk',
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
        expect(config.sonar.minimumCoverage).toBe(90);
        expect(describeDevplatConfig(config)).toContain('VannaDii/devplat');
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
  ];

  it.each(cases)('$name', ({ inputs, mock, assert }) => {
    assert(mock(inputs));
  });
});
