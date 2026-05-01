import { describe, expect, it } from 'vitest';

import { RuntimeConfigService } from './service.js';

describe('RuntimeConfigService', () => {
  const cases = [
    {
      name: 'loads defaults from environment values',
      inputs: {
        env: {
          DISCORD_APPLICATION_ID: 'application-default',
          DISCORD_PUBLIC_KEY: 'public-key-default',
          DISCORD_BOT_TOKEN: 'bot-token-default',
        },
      },
      mock: ({ env }: { env: Record<string, string> }) =>
        new RuntimeConfigService().fromEnvironment(env),
      assert: (config: ReturnType<RuntimeConfigService['fromEnvironment']>) => {
        expect(config.githubOwner).toBe('VannaDii');
        expect(config.github.apiBaseUrl).toBe('https://api.github.com');
        expect(config.storage.rootDirectory).toBe('devplat-state');
        expect(config.worktrees.rootDirectory).toBe('devplat-state/worktrees');
        expect(config.deployment.helmChartPath).toBe('deploy/helm/devplat');
        expect(config.discord.apiVersion).toBe('v10');
        expect(config.discord.projectManagementChannelId).toBe(
          'project-management-channel',
        );
        expect(new RuntimeConfigService().explain(config)).toContain('devplat');
      },
    },
    {
      name: 'respects environment overrides and exposes execute as a pass-through',
      inputs: {
        env: {
          GITHUB_OWNER: 'AcmeOrg',
          GITHUB_REPO: 'platform',
          DISCORD_API_BASE_URL: 'https://discord.com/api/v10',
          DISCORD_APPLICATION_ID: 'application-7',
          DISCORD_PUBLIC_KEY: 'public-key-7',
          DISCORD_BOT_TOKEN: 'bot-token-7',
          DISCORD_DEFAULT_GUILD_ID: 'guild-7',
          DISCORD_SPEC_CHANNEL_ID: 'specs',
          DISCORD_IMPLEMENTATION_CHANNEL_ID: 'impl',
          DISCORD_PULL_REQUEST_CHANNEL_ID: 'prs',
          DISCORD_AUDIT_CHANNEL_ID: 'audit',
          DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID: 'pm',
          OPENCLAW_PLUGIN_ID: '@acme/platform-openclaw',
          GITHUB_API_BASE_URL: 'https://api.github.example',
          GITHUB_WEB_BASE_URL: 'https://github.example',
          GITHUB_TOKEN_ENV: 'ACME_GITHUB_TOKEN',
          DEVPLAT_DOCKER_IMAGE_REPOSITORY: 'ghcr.io/acme/platform-runtime',
          DEVPLAT_DOCKER_IMAGE_TAG: 'sha-123',
          DEVPLAT_HELM_RELEASE: 'platform-runtime',
          DEVPLAT_HELM_NAMESPACE: 'automation',
          SONAR_ORGANIZATION: 'AcmeOrg',
          SONAR_PROJECT_KEY: 'AcmeOrg_platform',
        },
      },
      mock: ({ env }: { env: Record<string, string> }) =>
        new RuntimeConfigService().fromEnvironment(env),
      assert: (config: ReturnType<RuntimeConfigService['fromEnvironment']>) => {
        const service = new RuntimeConfigService();

        expect(config.githubOwner).toBe('AcmeOrg');
        expect(config.githubRepo).toBe('platform');
        expect(config.github).toEqual({
          apiBaseUrl: 'https://api.github.example',
          webBaseUrl: 'https://github.example',
          tokenEnvironmentVariable: 'ACME_GITHUB_TOKEN',
        });
        expect(config.discord.applicationId).toBe('application-7');
        expect(config.discord.defaultGuildId).toBe('guild-7');
        expect(config.discord.pullRequestChannelId).toBe('prs');
        expect(config.discord.projectManagementChannelId).toBe('pm');
        expect(config.openclaw.pluginId).toBe('@acme/platform-openclaw');
        expect(config.deployment.dockerImageRepository).toBe(
          'ghcr.io/acme/platform-runtime',
        );
        expect(config.deployment.helmNamespace).toBe('automation');
        expect(service.execute(config)).toBe(config);
      },
    },
    {
      name: 'fails fast when required Discord credentials are missing',
      inputs: {
        env: {
          GITHUB_OWNER: 'AcmeOrg',
        },
      },
      mock:
        ({ env }: { env: Record<string, string> }) =>
        () =>
          new RuntimeConfigService().fromEnvironment(env),
      assert: (
        createConfig: () => ReturnType<RuntimeConfigService['fromEnvironment']>,
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
