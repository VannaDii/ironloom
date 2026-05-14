import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertDiscordUxCommandRegistration,
  assertDiscordUxFetchedMessage,
  assertDiscordUxRouteReplayResult,
  createDiscordUxLiveLabEnvironmentIssues,
  createDiscordUxScopeDecision,
  parseDiscordUxLiveLabArgs,
  runDiscordUxLiveLab,
  runDiscordUxInteractionProbe,
} from './discord-ux-live-lab.mjs';

/**
 * Stable thread id used by the Discord UX preflight fixtures.
 */
const fixtureThreadId = 'thread-ux-1';

/**
 * Stable parent channel id used by the Discord UX preflight fixtures.
 */
const fixtureParentChannelId = 'implementation-channel-1';

/**
 * Stable audit channel id used by the Discord UX preflight fixtures.
 */
const fixtureAuditChannelId = 'audit-channel-1';

/**
 * Stable custom id returned by the rendered Discord component fixture.
 */
const fixtureRenderedCustomId = `devplat:v1:show-status:${fixtureThreadId}`;

/**
 * Builds the shared Discord channel fixture consumed by the UX probe.
 */
function createDiscordChannelsFixture() {
  return {
    audit: {
      id: fixtureAuditChannelId,
      name: 'test-audit',
    },
    implementation: {
      id: fixtureParentChannelId,
      name: 'test-implementation',
    },
    projectManagement: {
      id: 'project-management-channel-1',
      name: 'test-project-management',
    },
    pullRequest: {
      id: 'pull-request-channel-1',
      name: 'test-pull-requests',
    },
    spec: {
      id: 'spec-channel-1',
      name: 'test-specs',
    },
  };
}

/**
 * Creates the structured Discord message payload used by the fake route handler.
 */
function createDiscordPayloadFixture(
  content,
  customId = fixtureRenderedCustomId,
) {
  return {
    content,
    allowed_mentions: {
      parse: [],
    },
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            label: 'Show Status',
            style: 2,
            custom_id: customId,
          },
        ],
      },
    ],
  };
}

/**
 * Creates a Discord request mock that records sent messages and returns them from fetches.
 */
function createDiscordRequestMock() {
  const messages = new Map();
  let nextMessageId = 1;

  return {
    messages,
    discordRequest: async (path, options = {}) => {
      const method = options.method ?? 'GET';
      if (
        path === `/channels/${fixtureParentChannelId}/threads` &&
        method === 'POST'
      ) {
        return {
          id: fixtureThreadId,
          name: options.body.name,
          parent_id: fixtureParentChannelId,
        };
      }

      if (
        path === `/channels/${fixtureThreadId}/messages` &&
        method === 'POST'
      ) {
        const messageId = `message-${String(nextMessageId)}`;
        nextMessageId += 1;
        const message = {
          id: messageId,
          channel_id: fixtureThreadId,
          content: options.body.content,
          allowed_mentions: options.body.allowed_mentions,
          components: options.body.components,
        };
        messages.set(messageId, message);
        return message;
      }

      const messageMatch = /^\/channels\/([^/]+)\/messages\/([^/]+)$/u.exec(
        path,
      );
      if (messageMatch !== null && method === 'GET') {
        return messages.get(messageMatch[2]);
      }

      throw new Error(`Unexpected Discord request: ${path} ${method}`);
    },
  };
}

/**
 * Creates a Gateway service mock that posts the same payload shape as production.
 */
function createGatewayServiceMock({ transport }) {
  return {
    async handleDispatch(event) {
      const customId = event.d.data?.custom_id;
      const isButton = typeof customId === 'string';
      const payload = createDiscordPayloadFixture(
        isButton ? 'Button route accepted.' : 'Slash route accepted.',
      );
      const threadReceipt = await transport.postThreadMessage(
        fixtureThreadId,
        payload,
      );

      return {
        status: 'handled',
        interactionId: event.d.id,
        threadId: fixtureThreadId,
        controlResult: {
          allowed: true,
          failedClosed: false,
          request: {
            action: isButton ? 'show-status' : 'retry-gates',
            threadId: fixtureThreadId,
          },
          responseReceipt: {
            endpoint: `/interactions/${event.d.id}/${event.d.token}/callback`,
            responseBody: {
              deferred: true,
            },
            statusCode: 202,
          },
          threadPayload: payload,
          threadReceipt,
        },
      };
    },
  };
}

/**
 * Creates a webhook service mock that models Discord's immediate component ACK.
 */
function createWebhookServiceMock({ transport }) {
  const backgroundTasks = [];

  return {
    backgroundTasks,
    service: {
      async handle(request) {
        const parsed = JSON.parse(request.body);
        const customId = parsed.data?.custom_id;
        backgroundTasks.push(
          (async () => {
            const payload = createDiscordPayloadFixture(
              'Webhook button route accepted.',
            );
            const threadReceipt = await transport.postThreadMessage(
              fixtureThreadId,
              payload,
            );

            return {
              allowed: true,
              failedClosed: false,
              persistedKey: parsed.id,
              request: {
                action: 'show-status',
                threadId: fixtureThreadId,
              },
              threadPayload: payload,
              threadReceipt,
            };
          })(),
        );

        return {
          handled: typeof customId === 'string',
          persistedKey: parsed.id,
          responseBody: {
            type: 6,
          },
          statusCode: 200,
          threadId: fixtureThreadId,
        };
      },
    },
  };
}

describe('Discord UX live-lab helpers', () => {
  const cases = [
    {
      name: 'requires live validation for Discord interaction paths and skips unrelated docs-only changes',
      inputs: {
        relevant: [
          'packages/discord/src/interaction-gateway/service.ts',
          'site/guide-docs/guides/discord-workflows.md',
        ],
        irrelevant: ['site/guide-docs/index.md'],
      },
      mock: (inputs) => ({
        relevant: createDiscordUxScopeDecision({
          changedFiles: inputs.relevant,
          eventName: 'pull_request',
        }),
        irrelevant: createDiscordUxScopeDecision({
          changedFiles: inputs.irrelevant,
          eventName: 'pull_request',
        }),
      }),
      assert: ({ relevant, irrelevant }) => {
        expect(relevant).toMatchObject({
          runRequired: true,
          relevantFiles: [
            'packages/discord/src/interaction-gateway/service.ts',
            'site/guide-docs/guides/discord-workflows.md',
          ],
        });
        expect(irrelevant).toMatchObject({
          runRequired: false,
          relevantFiles: [],
          skipReason: expect.stringContaining('No Discord UX relevant files'),
        });
      },
    },
    {
      name: 'writes skipped reports with the full top-level report contract',
      inputs: {
        changedFiles: ['site/guide-docs/index.md'],
      },
      mock: async (inputs) => {
        const reportDirectory = await mkdtemp(
          resolve(tmpdir(), 'devplat-discord-ux-skip-contract-'),
        );
        const result = await runDiscordUxLiveLab({
          changedFiles: inputs.changedFiles,
          environment: {
            discord: {
              applicationId: '',
              baseUrl: 'https://discord.test/api/v10',
              botToken: '',
              guildId: '',
            },
            githubWorkflow: {
              eventName: 'pull_request',
              ref: 'feature/docs',
              runAttempt: '1',
              runNumber: '200',
              sha: 'sha-1',
              stepSummaryPath: null,
            },
          },
          reportDir: reportDirectory,
        });
        const reportText = await readFile(
          resolve(reportDirectory, 'discord-ux-live-lab-report.json'),
          'utf8',
        );

        return {
          result,
          writtenReport: JSON.parse(reportText),
        };
      },
      assert: ({ result, writtenReport }) => {
        expect(result).toMatchObject({
          commands: null,
          discord: null,
          error: null,
          messages: null,
          routeReplays: [],
          status: 'skipped',
          thread: null,
        });
        expect(writtenReport).toMatchObject({
          error: null,
          status: 'skipped',
        });
      },
    },
    {
      name: 'reports missing required live Discord environment values',
      inputs: {
        env: {
          LIVE_TEST_DISCORD_APPLICATION_ID: 'app-1',
        },
      },
      mock: (inputs) => createDiscordUxLiveLabEnvironmentIssues(inputs.env),
      assert: (result) => {
        expect(result).toEqual([
          'LIVE_TEST_DISCORD_BOT_TOKEN',
          'LIVE_TEST_DISCORD_GUILD_ID',
        ]);
      },
    },
    {
      name: 'parses manual operator hold arguments and rejects invalid durations',
      inputs: {
        validArgs: [
          '--changed-file',
          'packages/discord/src/interaction-gateway/service.ts',
          '--operator-hold-ms',
          '150000',
        ],
        invalidArgs: ['--operator-hold-ms', '-1'],
      },
      mock: (inputs) => ({
        invalidRun: () => parseDiscordUxLiveLabArgs(inputs.invalidArgs),
        valid: parseDiscordUxLiveLabArgs(inputs.validArgs),
      }),
      assert: ({ invalidRun, valid }) => {
        expect(valid).toMatchObject({
          changedFiles: ['packages/discord/src/interaction-gateway/service.ts'],
          operatorHoldMs: 150000,
        });
        expect(invalidRun).toThrow(
          '--operator-hold-ms must be a non-negative integer.',
        );
      },
    },
    {
      name: 'fails when Discord command registration omits an expected command',
      inputs: {
        registration: {
          names: ['retry-gates', 'show-status'],
          responseBody: [{ name: 'retry-gates' }],
        },
      },
      mock: (inputs) => () =>
        assertDiscordUxCommandRegistration(inputs.registration),
      assert: (run) => {
        expect(run).toThrow(
          'Discord command registration did not return expected commands: show-status',
        );
      },
    },
    {
      name: 'fails when posted allowed mentions or fetched button metadata are unsafe',
      inputs: {
        receipt: {
          body: {
            allowed_mentions: {
              parse: ['users'],
            },
          },
          channelId: fixtureThreadId,
          messageId: 'message-1',
        },
        unsafeMentionsMessage: {
          id: 'message-1',
          channel_id: fixtureThreadId,
          content: 'content',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: fixtureRenderedCustomId,
                  label: 'Show Status',
                  style: 2,
                },
              ],
            },
          ],
        },
        missingButtonMetadataReceipt: {
          body: {
            allowed_mentions: {
              parse: [],
            },
          },
          channelId: fixtureThreadId,
          messageId: 'message-1',
        },
        missingButtonMetadataMessage: {
          id: 'message-1',
          channel_id: fixtureThreadId,
          content: 'content',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: fixtureRenderedCustomId,
                },
              ],
            },
          ],
        },
      },
      mock: (inputs) => [
        () =>
          assertDiscordUxFetchedMessage({
            fetchedMessage: inputs.unsafeMentionsMessage,
            receipt: inputs.receipt,
          }),
        () =>
          assertDiscordUxFetchedMessage({
            fetchedMessage: inputs.missingButtonMetadataMessage,
            receipt: inputs.missingButtonMetadataReceipt,
          }),
      ],
      assert: (runs) => {
        expect(runs[0]).toThrow(
          'Posted Discord UX message allowed mentions were not restricted.',
        );
        expect(runs[1]).toThrow(
          'Fetched Discord UX message contained incomplete button metadata.',
        );
      },
    },
    {
      name: 'fails when a fetched Discord message is missing rendered content or components',
      inputs: {
        receipt: {
          channelId: fixtureThreadId,
          messageId: 'message-1',
        },
        fetchedMessage: {
          id: 'message-1',
          channel_id: fixtureThreadId,
          content: '',
          components: [],
        },
      },
      mock: (inputs) => () =>
        assertDiscordUxFetchedMessage({
          fetchedMessage: inputs.fetchedMessage,
          receipt: inputs.receipt,
        }),
      assert: (run) => {
        expect(run).toThrow(
          'Fetched Discord UX message did not include operator-visible content.',
        );
      },
    },
    {
      name: 'fails when fetched Discord component custom ids are duplicate malformed or overlong',
      inputs: {
        receipt: {
          channelId: fixtureThreadId,
          messageId: 'message-1',
        },
        messages: [
          {
            id: 'message-1',
            channel_id: fixtureThreadId,
            content: 'content',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: fixtureRenderedCustomId,
                    label: 'Show Status',
                    style: 2,
                  },
                  {
                    type: 2,
                    custom_id: fixtureRenderedCustomId,
                    label: 'Show Status',
                    style: 2,
                  },
                ],
              },
            ],
          },
          {
            id: 'message-1',
            channel_id: fixtureThreadId,
            content: 'content',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: 'not-a-devplat-control',
                    label: 'Show Status',
                    style: 2,
                  },
                ],
              },
            ],
          },
          {
            id: 'message-1',
            channel_id: fixtureThreadId,
            content: 'content',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: `devplat:v1:show-status:${'x'.repeat(101)}`,
                    label: 'Show Status',
                    style: 2,
                  },
                ],
              },
            ],
          },
        ],
      },
      mock: (inputs) =>
        inputs.messages.map(
          (fetchedMessage) => () =>
            assertDiscordUxFetchedMessage({
              fetchedMessage,
              receipt: inputs.receipt,
            }),
        ),
      assert: (runs) => {
        expect(runs[0]).toThrow(
          'Fetched Discord UX message contained duplicate component custom ids.',
        );
        expect(runs[1]).toThrow(
          'Fetched Discord UX message contained malformed component custom ids.',
        );
        expect(runs[2]).toThrow(
          'Fetched Discord UX message contained overlong component custom ids.',
        );
      },
    },
    {
      name: 'fails validation when a route replay resolves the wrong thread',
      inputs: {
        result: {
          status: 'handled',
          threadId: 'wrong-thread',
          controlResult: {
            allowed: true,
            failedClosed: false,
            request: {
              threadId: 'wrong-thread',
            },
            threadReceipt: {
              endpoint: '/channels/wrong-thread/messages',
              responseBody: {
                id: 'message-1',
              },
              statusCode: 201,
            },
          },
        },
      },
      mock: (inputs) => () =>
        assertDiscordUxRouteReplayResult({
          expectedThreadId: fixtureThreadId,
          label: 'button',
          result: inputs.result,
        }),
      assert: (run) => {
        expect(run).toThrow(
          'Discord UX button replay resolved the wrong thread.',
        );
      },
    },
    {
      name: 'routes slash and fetched-button replays to the same Discord thread',
      inputs: {},
      mock: async () => {
        const reportDirectory = await mkdtemp(
          resolve(tmpdir(), 'devplat-discord-ux-live-lab-'),
        );
        const context = createDiscordRequestMock();
        const result = await runDiscordUxInteractionProbe(
          {
            discordChannels: createDiscordChannelsFixture(),
            discordRequest: context.discordRequest,
            reportDirectory,
            runLabel: '200-1',
            updatedAt: '2026-05-13T00:00:00.000Z',
          },
          {
            createDiscordGatewayService: createGatewayServiceMock,
            createDiscordWebhookService: createWebhookServiceMock,
            persistDiscordGatewayBoundSession: async () => ({
              key: 'session-1',
              scope: 'state',
            }),
          },
        );
        const reportText = await readFile(
          resolve(reportDirectory, 'discord-ux-interaction-probe.json'),
          'utf8',
        );

        return {
          report: JSON.parse(reportText),
          result,
        };
      },
      assert: ({ report, result }) => {
        expect(result.thread.id).toBe(fixtureThreadId);
        expect(result.routeReplays).toEqual([
          expect.objectContaining({
            action: 'retry-gates',
            label: 'slash',
            threadId: fixtureThreadId,
          }),
          expect.objectContaining({
            action: 'show-status',
            label: 'button',
            threadId: fixtureThreadId,
          }),
          expect.objectContaining({
            acknowledgementType: 6,
            action: 'show-status',
            label: 'webhook-button',
            threadId: fixtureThreadId,
          }),
        ]);
        expect(result.messages.slash.componentCustomIds).toEqual([
          fixtureRenderedCustomId,
        ]);
        expect(result.messages.button.channelId).toBe(fixtureThreadId);
        expect(result.messages.webhookButton.channelId).toBe(fixtureThreadId);
        expect(report.routeReplays).toHaveLength(3);
      },
    },
    {
      name: 'keeps a real Gateway runtime open during manual operator hold windows',
      inputs: {
        operatorHoldMs: 25,
      },
      mock: async (inputs) => {
        const reportDirectory = await mkdtemp(
          resolve(tmpdir(), 'devplat-discord-ux-gateway-runtime-'),
        );
        const gatewayEvents = [
          {
            eventName: 'READY',
            status: 'ignored',
          },
        ];
        const closeCalls = [];
        const sleepCalls = [];
        const result = await runDiscordUxLiveLab(
          {
            changedFiles: [
              'packages/discord/src/interaction-gateway/service.ts',
            ],
            environment: {
              discord: {
                applicationId: 'application-1',
                baseUrl: 'https://discord.test/api/v10',
                botToken: 'bot-token-1',
                gatewayIntents: 0,
                gatewayUrl: 'wss://gateway.discord.test/?v=10&encoding=json',
                guildId: 'guild-1',
              },
              githubWorkflow: {
                eventName: 'pull_request',
                ref: 'feature/live-ux',
                runAttempt: '1',
                runNumber: '200',
                sha: 'sha-1',
                stepSummaryPath: null,
              },
            },
            operatorHoldMs: inputs.operatorHoldMs,
            reportDir: reportDirectory,
          },
          {
            discordRequest: async () => ({ id: 'guild-1' }),
            ensureDiscordChannels: async () => ({
              category: {
                id: 'category-1',
                name: 'test',
              },
              channels: createDiscordChannelsFixture(),
            }),
            registerDiscordApplicationCommands: async () => ({
              count: 1,
              endpoint: '/applications/application-1/guilds/guild-1/commands',
              names: ['show-status'],
              responseBody: [{ name: 'show-status' }],
            }),
            runDiscordUxInteractionProbe: async () => ({
              messages: {},
              routeReplays: [],
              thread: {
                id: fixtureThreadId,
                name: 'thread',
                parentChannelId: fixtureParentChannelId,
              },
            }),
            sleep: async (duration) => {
              sleepCalls.push(duration);
              gatewayEvents.push({
                interactionId: 'interaction-human-1',
                responseStatusCode: 204,
                status: 'handled',
                threadId: fixtureThreadId,
              });
            },
            startGatewayRuntime: async () => ({
              close: () => {
                closeCalls.push('closed');
              },
              errors: [],
              events: gatewayEvents,
              stateDirectory: resolve(reportDirectory, 'deep-test'),
            }),
          },
        );
        const runtimeReportText = await readFile(
          resolve(reportDirectory, 'discord-ux-gateway-runtime-report.json'),
          'utf8',
        );

        return {
          closeCalls,
          result,
          runtimeReport: JSON.parse(runtimeReportText),
          sleepCalls,
        };
      },
      assert: ({ closeCalls, result, runtimeReport, sleepCalls }) => {
        expect(sleepCalls).toEqual([25]);
        expect(closeCalls).toEqual(['closed']);
        expect(result.gatewayRuntime).toMatchObject({
          operatorHoldMs: 25,
          events: [
            {
              eventName: 'READY',
              status: 'ignored',
            },
            {
              interactionId: 'interaction-human-1',
              responseStatusCode: 204,
              status: 'handled',
              threadId: fixtureThreadId,
            },
          ],
        });
        expect(runtimeReport.events).toHaveLength(2);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    await testCase.assert(result);
  });
});
