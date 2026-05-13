import { describe, expect, it } from 'vitest';

import {
  createLocalActionPanelPayload,
  createLocalStackRuntimeEnv,
  localStackActionPanelActions,
  parseLocalStackArgs,
} from './openclaw-local-stack.mjs';

describe('openclaw-local-stack helpers', () => {
  const cases = [
    {
      name: 'renders one button for each Discord control action',
      inputs: {
        session: {
          actorId: 'operator-1',
          artifactId: 'artifact-local-1',
          channelId: 'thread-1',
          guildId: 'guild-1',
          parentChannelId: 'implementation-1',
          sliceId: 'local-slice-1',
          threadId: 'thread-1',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        const payload = createLocalActionPanelPayload(inputs.session);
        const customIds = payload.components.flatMap((row) =>
          row.components.map((component) => component.custom_id),
        );

        expect(payload.content).toContain('DevPlat · Local action panel');
        expect(customIds).toHaveLength(localStackActionPanelActions.length);
        expect(customIds).toEqual(
          localStackActionPanelActions.map(
            (action) => `devplat:v1:${action}:thread-1`,
          ),
        );
      },
    },
    {
      name: 'maps local Discord sandbox channels into runtime env',
      inputs: {
        discord: {
          applicationId: 'app-1',
          baseUrl: 'https://discord.test/api/v10',
          botToken: 'bot-token-1',
          categoryName: 'local-stack',
          guildId: 'guild-1',
          publicKey: 'public-key-1',
        },
        discordChannels: {
          audit: { id: 'audit-1' },
          implementation: { id: 'implementation-1' },
          projectManagement: { id: 'pm-1' },
          pullRequest: { id: 'pull-request-1' },
          spec: { id: 'spec-1' },
        },
        githubOwner: 'VannaDii',
        repoName: 'devplat',
        sonarOrganization: 'vannadii',
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        const runtimeEnv = createLocalStackRuntimeEnv(inputs);

        expect(runtimeEnv).toMatchObject({
          DISCORD_API_BASE_URL: 'https://discord.test/api/v10',
          DISCORD_APPLICATION_ID: 'app-1',
          DISCORD_AUDIT_CHANNEL_ID: 'audit-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DISCORD_DEFAULT_GUILD_ID: 'guild-1',
          DISCORD_IMPLEMENTATION_CHANNEL_ID: 'implementation-1',
          DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID: 'pm-1',
          DISCORD_PULL_REQUEST_CHANNEL_ID: 'pull-request-1',
          DISCORD_SPEC_CHANNEL_ID: 'spec-1',
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          SONAR_ORGANIZATION: 'vannadii',
          SONAR_PROJECT_KEY: 'VannaDii_devplat',
        });
      },
    },
    {
      name: 'parses explicit local debug ports',
      inputs: {
        argv: [
          '--openclaw-inspect-port',
          '9329',
          '--discord-inspect-port',
          '9330',
        ],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(parseLocalStackArgs(inputs.argv)).toMatchObject({
          discordInspectPort: 9330,
          openclawInspectPort: 9329,
        });
      },
    },
  ];

  it.each(cases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock();

    await assert(context, inputs);
  });
});
