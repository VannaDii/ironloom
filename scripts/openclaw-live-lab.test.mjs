import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectFixtureFiles,
  createGitHubRepositoryCreatePath,
  createGitHubRepositoryListPath,
  createDiscordChannelPlan,
  createDiscordRequest,
  createEvictionPlan,
  createLiveLabEnvironment,
  createLiveRuntimeEnv,
  createRunIdentifiers,
  loadLiveLabEnvironment,
  listGitHubRepositories,
  main as runLiveLabCommand,
  createSonarProjectKey,
  createStatusMessage,
  mapProgressToChannel,
  parseLiveLabArgs,
  registerDiscordApplicationCommands,
  resolveGitHubOwnerKind,
  runDiscordInteractionProbe,
  runLiveLab,
} from './openclaw-live-lab.mjs';

const temporaryRoots = [];
const { privateKey: liveLabAppPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
  publicKeyEncoding: {
    format: 'pem',
    type: 'spki',
  },
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

function createTrackedRouteHandler(label, calls, routes) {
  return async (path, options = {}) => {
    const method = options.method ?? 'GET';
    calls.push([path, method]);

    const handler = routes.get(`${method} ${path}`);
    if (handler === undefined) {
      throw new Error(`Unexpected ${label} request: ${path} ${method}`);
    }

    return typeof handler === 'function'
      ? handler({ method, options, path })
      : handler;
  };
}

/**
 * Creates the stable Discord command-registration result used by live-lab tests.
 */
function createRegisteredDiscordCommandsFixture() {
  return {
    count: 14,
    endpoint: '/applications/app-1/guilds/guild-1/commands',
    names: ['run-this', 'retry-gates', 'show-status'],
    responseBody: [],
  };
}

/**
 * Creates a Discord command-registration mock without duplicating callback bodies.
 */
function createRegisterDiscordApplicationCommandsMock() {
  return async () => createRegisteredDiscordCommandsFixture();
}

describe('openclaw-live-lab helpers', () => {
  const cases = [
    {
      name: 'exercises simulated Discord interaction callbacks through the response transport',
      inputs: {
        runLabel: '200-1',
      },
      mock: async () => {
        const discordMessages = [];
        const serviceCalls = [];
        const discordRequest = async (path, options = {}) => {
          discordMessages.push([path, options.body]);
          return { id: `message-${discordMessages.length}` };
        };
        const createDiscordControlPlaneService = async ({ transport }) => ({
          async handleInteraction(input) {
            serviceCalls.push(input);
            const acceptedPayload = {
              content: 'DevPlat accepted retry-gates.',
              /**
               * Discord message payload wire key used to suppress operator pings.
               */
              allowed_mentions: { parse: [] },
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      label: 'Show Status',
                      style: 2,
                      /**
                       * Discord component wire key returned by button interactions.
                       */
                      custom_id: 'devplat:v1:show-status:implementation-1',
                    },
                  ],
                },
              ],
            };
            const responseReceipt = await transport.postInteractionResponse(
              input,
              acceptedPayload,
            );
            const threadReceipt = await transport.postThreadMessage(
              input.boundThreadId,
              acceptedPayload,
            );

            return {
              allowed: true,
              failedClosed: false,
              persistedKey: input.id,
              policyDecisionId: 'policy-retry-gates',
              request: {
                action: 'retry-gates',
                actorId: input.actorId,
                channelId: input.channelId,
                id: input.id,
                privileged: false,
                status: 'approved',
                summary: input.summary,
                threadId: input.boundThreadId,
                trace: [],
                updatedAt: input.updatedAt,
              },
              responseReceipt,
              responsePayload: acceptedPayload,
              threadReceipt,
              threadPayload: acceptedPayload,
            };
          },
        });

        return {
          createDiscordControlPlaneService,
          createDiscordOperatorInteractionFromCallback: async (
            callback,
            options,
          ) => ({
            id: callback.id,
            token: callback.token,
            actorId: callback.member.user.id,
            channelId: callback.channel_id,
            threadId: options.threadId,
            boundThreadId: options.boundThreadId,
            boundSession: options.boundSession,
            commandName: callback.data.name,
            summary: options.summary,
            privileged: options.privileged,
            updatedAt: options.updatedAt,
          }),
          discordMessages,
          discordRequest,
          serviceCalls,
        };
      },
      assert: async (context, inputs) => {
        const result = await runDiscordInteractionProbe(
          {
            discordChannels: {
              audit: { id: 'audit-1' },
              implementation: { id: 'implementation-1' },
            },
            discordRequest: context.discordRequest,
            reportDirectory: resolve(tmpdir(), 'devplat-live-lab-probe'),
            runLabel: inputs.runLabel,
            updatedAt: '2026-04-30T00:00:00.000Z',
          },
          {
            createDiscordControlPlaneService:
              context.createDiscordControlPlaneService,
            createDiscordOperatorInteractionFromCallback:
              context.createDiscordOperatorInteractionFromCallback,
          },
        );

        expect(result).toMatchObject({
          action: 'retry-gates',
          allowed: true,
          componentCustomIds: ['devplat:v1:show-status:implementation-1'],
          componentRows: 1,
          commandName: 'retry-gates',
          failedClosed: false,
          interactionMessageId: 'message-1',
          interactionEndpoint:
            '/interactions/live-lab-200-1-retry-gates/simulated-token-200-1/callback',
          responseContent:
            'simulated interaction callback: DevPlat accepted retry-gates.',
          threadContent: 'DevPlat accepted retry-gates.',
          threadEndpoint: '/channels/implementation-1/messages',
          threadMessageId: 'message-2',
        });
        expect(context.serviceCalls[0]).toMatchObject({
          actorId: 'live-lab-operator',
          boundThreadId: 'implementation-1',
          boundSession: {
            threadId: 'implementation-1',
            kind: 'implementation',
          },
          commandName: 'retry-gates',
        });
        expect(context.discordMessages).toEqual([
          [
            '/channels/audit-1/messages',
            {
              /**
               * Discord message payload wire key used to suppress operator pings.
               */
              allowed_mentions: { parse: [] },
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      label: 'Show Status',
                      style: 2,
                      /**
                       * Discord component wire key returned by button interactions.
                       */
                      custom_id: 'devplat:v1:show-status:implementation-1',
                    },
                  ],
                },
              ],
              content:
                'simulated interaction callback: DevPlat accepted retry-gates.',
            },
          ],
          [
            '/channels/implementation-1/messages',
            {
              /**
               * Discord message payload wire key used to suppress operator pings.
               */
              allowed_mentions: { parse: [] },
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      label: 'Show Status',
                      style: 2,
                      /**
                       * Discord component wire key returned by button interactions.
                       */
                      custom_id: 'devplat:v1:show-status:implementation-1',
                    },
                  ],
                },
              ],
              content: 'DevPlat accepted retry-gates.',
            },
          ],
        ]);
      },
    },
    {
      name: 'registers Discord application command contracts in the sandbox guild',
      inputs: {
        applicationId: 'app-1',
        guildId: 'guild-1',
      },
      mock: async () => {
        const discordCalls = [];
        const discordRequest = async (path, options = {}) => {
          discordCalls.push([path, options.method ?? 'GET', options.body]);
          return [{ id: 'command-1', name: 'retry-gates' }];
        };
        const createDiscordApplicationCommandPayloads = async () => [
          {
            name: 'retry-gates',
            description: 'Retry gates for this thread.',
            type: 1,
          },
          {
            name: 'show-status',
            description: 'Show status for this thread.',
            type: 1,
          },
        ];

        return {
          createDiscordApplicationCommandPayloads,
          discordCalls,
          discordRequest,
        };
      },
      assert: async (context, inputs) => {
        const result = await registerDiscordApplicationCommands(
          {
            applicationId: inputs.applicationId,
            discordRequest: context.discordRequest,
            guildId: inputs.guildId,
          },
          {
            createDiscordApplicationCommandPayloads:
              context.createDiscordApplicationCommandPayloads,
          },
        );

        expect(result).toMatchObject({
          count: 2,
          endpoint: '/applications/app-1/guilds/guild-1/commands',
          names: ['retry-gates', 'show-status'],
        });
        expect(context.discordCalls).toEqual([
          [
            '/applications/app-1/guilds/guild-1/commands',
            'PUT',
            [
              {
                name: 'retry-gates',
                description: 'Retry gates for this thread.',
                type: 1,
              },
              {
                name: 'show-status',
                description: 'Show status for this thread.',
                type: 1,
              },
            ],
          ],
        ]);
      },
    },
    {
      name: 'fails the simulated Discord interaction probe when response receipts are missing',
      inputs: {
        runLabel: '200-2',
      },
      mock: async () => {
        const createDiscordControlPlaneService = async () => ({
          async handleInteraction(input) {
            return {
              allowed: true,
              failedClosed: false,
              persistedKey: input.id,
              policyDecisionId: 'policy-retry-gates',
              request: {
                action: 'retry-gates',
                actorId: input.actorId,
                channelId: input.channelId,
                id: input.id,
                privileged: false,
                status: 'approved',
                summary: input.summary,
                threadId: input.boundThreadId,
                trace: [],
                updatedAt: input.updatedAt,
              },
            };
          },
        });

        return {
          createDiscordControlPlaneService,
          createDiscordOperatorInteractionFromCallback: async (
            callback,
            options,
          ) => ({
            id: callback.id,
            token: callback.token,
            actorId: callback.member.user.id,
            channelId: callback.channel_id,
            threadId: options.threadId,
            boundThreadId: options.boundThreadId,
            boundSession: options.boundSession,
            commandName: callback.data.name,
            summary: options.summary,
            privileged: options.privileged,
            updatedAt: options.updatedAt,
          }),
          discordRequest: async () => ({ id: 'message-1' }),
        };
      },
      assert: async (context, inputs) => {
        await expect(
          runDiscordInteractionProbe(
            {
              discordChannels: {
                audit: { id: 'audit-1' },
                implementation: { id: 'implementation-1' },
              },
              discordRequest: context.discordRequest,
              reportDirectory: resolve(tmpdir(), 'devplat-live-lab-probe'),
              runLabel: inputs.runLabel,
              updatedAt: '2026-04-30T00:00:00.000Z',
            },
            {
              createDiscordControlPlaneService:
                context.createDiscordControlPlaneService,
              createDiscordOperatorInteractionFromCallback:
                context.createDiscordOperatorInteractionFromCallback,
            },
          ),
        ).rejects.toThrow('Discord interaction probe did not record receipts');
      },
    },
    {
      name: 'fails the simulated Discord interaction probe when actionable components are missing',
      inputs: {
        runLabel: '200-3',
      },
      mock: async () => {
        const createDiscordControlPlaneService = async ({ transport }) => ({
          async handleInteraction(input) {
            const payload = {
              content: 'DevPlat accepted retry-gates without controls.',
            };
            const responseReceipt = await transport.postInteractionResponse(
              input,
              payload,
            );
            const threadReceipt = await transport.postThreadMessage(
              input.boundThreadId,
              payload,
            );

            return {
              allowed: true,
              failedClosed: false,
              persistedKey: input.id,
              policyDecisionId: 'policy-retry-gates',
              request: {
                action: 'retry-gates',
                actorId: input.actorId,
                channelId: input.channelId,
                id: input.id,
                privileged: false,
                status: 'approved',
                summary: input.summary,
                threadId: input.boundThreadId,
                trace: [],
                updatedAt: input.updatedAt,
              },
              responsePayload: payload,
              responseReceipt,
              threadPayload: payload,
              threadReceipt,
            };
          },
        });

        return {
          createDiscordControlPlaneService,
          createDiscordOperatorInteractionFromCallback: async (
            callback,
            options,
          ) => ({
            id: callback.id,
            token: callback.token,
            actorId: callback.member.user.id,
            channelId: callback.channel_id,
            threadId: options.threadId,
            boundThreadId: options.boundThreadId,
            boundSession: options.boundSession,
            commandName: callback.data.name,
            summary: options.summary,
            privileged: options.privileged,
            updatedAt: options.updatedAt,
          }),
          discordRequest: async () => ({ id: 'message-1' }),
        };
      },
      assert: async (context, inputs) => {
        await expect(
          runDiscordInteractionProbe(
            {
              discordChannels: {
                audit: { id: 'audit-1' },
                implementation: { id: 'implementation-1' },
              },
              discordRequest: context.discordRequest,
              reportDirectory: resolve(tmpdir(), 'devplat-live-lab-probe'),
              runLabel: inputs.runLabel,
              updatedAt: '2026-04-30T00:00:00.000Z',
            },
            {
              createDiscordControlPlaneService:
                context.createDiscordControlPlaneService,
              createDiscordOperatorInteractionFromCallback:
                context.createDiscordOperatorInteractionFromCallback,
            },
          ),
        ).rejects.toThrow(
          'Discord interaction probe did not publish actionable controls',
        );
      },
    },
    {
      name: 'parses CLI flags and derives run metadata',
      inputs: {
        argv: [
          '--ref',
          'main',
          '--image',
          'ghcr.io/vannadii/devplat-openclaw:test',
          '--skip-build',
          '--max-parallel-repos',
          '6',
          '--operator-hold-ms',
          '30000',
          '--retain-failed-resources',
        ],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        const parsed = parseLiveLabArgs(inputs.argv);
        const identifiers = createRunIdentifiers({
          runAttempt: 2,
          runNumber: 101,
        });
        const channelPlan = createDiscordChannelPlan();

        expect(parsed).toMatchObject({
          image: 'ghcr.io/vannadii/devplat-openclaw:test',
          maxParallelRepos: 6,
          operatorHoldMs: 30000,
          ref: 'main',
          retainFailedResources: true,
          skipBuild: true,
        });
        expect(parseLiveLabArgs([]).operatorHoldMs).toBe(150000);
        expect(identifiers).toMatchObject({
          branchName: 'live-test/101-2',
          categoryName: 'test',
          repoName: 'devplat-test-101-2',
        });
        expect(channelPlan.map((channel) => channel.name)).toEqual([
          'spec',
          'implementation',
          'pull-request',
          'audit',
          'project-management',
        ]);
        expect(channelPlan.map((channel) => channel.categoryName)).toEqual([
          'test',
          'test',
          'test',
          'test',
          'test',
        ]);
        expect(
          createDiscordChannelPlan('repo-alpha').map(
            (channel) => channel.categoryName,
          ),
        ).toEqual([
          'repo-alpha',
          'repo-alpha',
          'repo-alpha',
          'repo-alpha',
          'repo-alpha',
        ]);
      },
    },
    {
      name: 'preserves the Discord API base path during preflight requests',
      inputs: {},
      mock: async () => {
        const fetchCalls = [];
        const fetchImpl = async (url, options) => {
          fetchCalls.push({ options, url: String(url) });

          return {
            status: 200,
            text: async () => JSON.stringify({ id: 'guild-1' }),
          };
        };

        return {
          discordRequest: createDiscordRequest({
            baseUrl: 'https://discord.example/api/v10',
            botToken: 'bot-token-1',
            fetchImpl,
          }),
          fetchCalls,
        };
      },
      assert: async (context) => {
        await expect(
          context.discordRequest('/guilds/guild-1'),
        ).resolves.toEqual({ id: 'guild-1' });

        expect(context.fetchCalls).toEqual([
          {
            options: expect.objectContaining({
              headers: expect.objectContaining({
                authorization: 'Bot bot-token-1',
              }),
              method: 'GET',
            }),
            url: 'https://discord.example/api/v10/guilds/guild-1',
          },
        ]);
      },
    },
    {
      name: 'computes eviction, runtime env, and progress routing',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const eviction = createEvictionPlan(
          [
            {
              name: 'devplat-test-11-1',
              created_at: '2026-04-10T00:00:00.000Z',
            },
            {
              name: 'devplat-test-12-1',
              created_at: '2026-04-11T00:00:00.000Z',
            },
          ],
          2,
        );
        const runtimeEnv = createLiveRuntimeEnv({
          discordChannels: {
            audit: { id: 'audit-1' },
            implementation: { id: 'implementation-1' },
            projectManagement: { id: 'pm-1' },
            pullRequest: { id: 'pr-1' },
            spec: { id: 'spec-1' },
          },
          discordConfig: {
            applicationId: 'app-1',
            categoryName: 'test',
            botToken: 'bot-token-1',
            guildId: 'guild-1',
            publicKey: 'public-key-1',
          },
          githubOrganization: 'sandbox-org',
          repoName: 'devplat-test-200-3',
          sonarOrganization: 'sandbox-sonar',
        });
        const environment = createLiveLabEnvironment({
          GITHUB_REF_NAME: 'main',
          GITHUB_REPOSITORY: 'VannaDii/devplat',
          GITHUB_RUN_ATTEMPT: '4',
          GITHUB_RUN_ID: '9001',
          GITHUB_RUN_NUMBER: '300',
          GITHUB_SERVER_URL: 'https://github.com',
          GITHUB_SHA: 'abc123',
          LIVE_TEST_DISCORD_APPLICATION_ID: 'app-1',
          LIVE_TEST_DISCORD_BOT_TOKEN: 'bot-token-1',
          LIVE_TEST_DISCORD_GUILD_ID: 'guild-1',
          LIVE_TEST_DISCORD_PUBLIC_KEY: 'public-key-1',
          LIVE_TEST_GITHUB_ORG: 'sandbox-org',
          LIVE_TEST_GITHUB_TOKEN: 'github-token-1',
          LIVE_TEST_SONAR_ORGANIZATION: 'sandbox-sonar',
          LIVE_TEST_SONAR_TOKEN: 'sonar-token-1',
        });
        const message = createStatusMessage({
          controlThreadId: 'project-management-1',
          details: 'Bootstrapped the lab.',
          phase: 'bootstrap',
          ref: 'main',
          repoFullName: 'sandbox-org/devplat-test-200-3',
          runLabel: '200-3',
          sha: 'abc123',
          status: 'in-progress',
          workflowUrl: 'https://github.com/VannaDii/devplat/actions/runs/9001',
        });

        expect(eviction?.candidate.name).toBe('devplat-test-11-1');
        expect(createSonarProjectKey('sandbox-org', 'devplat-test-200-3')).toBe(
          'sandbox-org_devplat-test-200-3',
        );
        expect(runtimeEnv).toMatchObject({
          GITHUB_OWNER: 'sandbox-org',
          GITHUB_REPO: 'devplat-test-200-3',
          SONAR_PROJECT_KEY: 'sandbox-org_devplat-test-200-3',
        });
        expect(environment.githubWorkflow).toMatchObject({
          runAttempt: '4',
          runNumber: '300',
        });
        expect(message).toEqual({
          allowed_mentions: { parse: [] },
          content: [
            '🟡 DevPlat · Live lab bootstrap',
            '',
            'Status: in-progress',
            'Scope: live-lab · 200-3',
            'Item: sandbox-org/devplat-test-200-3',
            'Actor: workflow',
            'Sha: abc123',
            '→ Bootstrapped the lab.',
            '',
            'Ref: main',
            'Workflow: <https://github.com/VannaDii/devplat/actions/runs/9001>',
          ].join('\n'),
          flags: 4,
        });
        expect(
          mapProgressToChannel({
            phase: 'planning',
            step: 'create_spec_record',
          }),
        ).toBe('spec');
        expect(
          mapProgressToChannel({
            phase: 'delivery',
            step: 'submit_pull_request_update',
          }),
        ).toBe('pullRequest');
      },
    },
    {
      name: 'omits stale interactive controls from live-lab status messages',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const message = createStatusMessage({
          controlThreadId: 'project-management-1',
          details: 'Status only.',
          phase: 'bootstrap',
          ref: 'main',
          repoFullName: 'sandbox-org/devplat-test-status-only',
          runLabel: '200-4',
          sha: 'abc123',
          status: 'in-progress',
          workflowUrl: null,
        });

        expect(message).not.toHaveProperty('components');
      },
    },
    {
      name: 'renders failed live-lab status messages with the blocked status anchor',
      inputs: {
        workflowUrl: 'https://github.com/VannaDii/devplat/actions/runs/9002',
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        const message = createStatusMessage({
          controlThreadId: 'project-management-1',
          details: 'Deep test failed.',
          phase: 'failure',
          ref: 'main',
          repoFullName: 'sandbox-org/devplat-test-status-failed',
          runLabel: '200-5',
          sha: 'def456',
          status: 'failed',
          workflowUrl: inputs.workflowUrl,
        });

        expect(message.content).toContain('🔴 DevPlat · Live lab failure');
        expect(message.content).toContain('Status: failed');
        expect(message.content).toContain('Sha: def456');
        expect(message.content).toContain(`Workflow: <${inputs.workflowUrl}>`);
        expect(message.flags).toBe(4);
      },
    },
    {
      name: 'loads the environment by minting a GitHub App token',
      inputs: {},
      mock: async () => {
        const fetchCalls = [];
        const fetchImpl = async (url, options) => {
          fetchCalls.push({
            body:
              typeof options.body === 'string'
                ? JSON.parse(options.body)
                : undefined,
            headers: options.headers,
            method: options.method,
            url: String(url),
          });

          if (String(url).endsWith('/users/sandbox-org')) {
            return {
              status: 200,
              text: async () =>
                JSON.stringify({ login: 'sandbox-org', type: 'Organization' }),
            };
          }

          if (String(url).endsWith('/orgs/sandbox-org/installation')) {
            return {
              status: 200,
              text: async () => JSON.stringify({ id: 42 }),
            };
          }

          if (String(url).endsWith('/app/installations/42/access_tokens')) {
            return {
              status: 201,
              text: async () => JSON.stringify({ token: 'github-token-2' }),
            };
          }

          throw new Error(`Unexpected fetch: ${String(url)}`);
        };

        return { fetchCalls, fetchImpl };
      },
      assert: async (context) => {
        const env = {
          LIVE_TEST_DISCORD_APPLICATION_ID: 'app-1',
          LIVE_TEST_DISCORD_BOT_TOKEN: 'bot-token-1',
          LIVE_TEST_DISCORD_GUILD_ID: 'guild-1',
          LIVE_TEST_DISCORD_PUBLIC_KEY: 'public-key-1',
          LIVE_TEST_GITHUB_APP_CLIENT_ID: 'client-id-1',
          LIVE_TEST_GITHUB_APP_PRIVATE_KEY: liveLabAppPrivateKey,
          LIVE_TEST_GITHUB_ORG: 'sandbox-org',
          LIVE_TEST_SONAR_ORGANIZATION: 'sandbox-sonar',
          LIVE_TEST_SONAR_TOKEN: 'sonar-token-1',
        };

        const environment = await loadLiveLabEnvironment(env, {
          fetchImpl: context.fetchImpl,
        });

        expect(environment.github).toMatchObject({
          organization: 'sandbox-org',
          token: 'github-token-2',
        });
        expect(env['LIVE_TEST_GITHUB_TOKEN']).toBe('github-token-2');
        expect(context.fetchCalls).toEqual([
          expect.objectContaining({
            body: undefined,
            headers: expect.objectContaining({
              accept: 'application/vnd.github+json',
              authorization: expect.stringMatching(/^Bearer /u),
              'x-github-api-version': '2026-03-10',
            }),
            method: 'GET',
            url: 'https://api.github.com/users/sandbox-org',
          }),
          expect.objectContaining({
            body: undefined,
            method: 'GET',
            url: 'https://api.github.com/orgs/sandbox-org/installation',
          }),
          expect.objectContaining({
            body: {
              permissions: {
                actions: 'write',
                administration: 'write',
                checks: 'read',
                contents: 'write',
                issues: 'write',
                metadata: 'read',
                pull_requests: 'write',
                workflows: 'write',
              },
            },
            method: 'POST',
            url: 'https://api.github.com/app/installations/42/access_tokens',
          }),
        ]);
      },
    },
    {
      name: 'requires an explicit GitHub token for user-owned live labs',
      inputs: {},
      mock: async () => {
        const fetchCalls = [];
        const fetchImpl = async (url, options) => {
          fetchCalls.push({
            headers: options.headers,
            method: options.method,
            url: String(url),
          });

          if (String(url).endsWith('/users/sandbox-user')) {
            return {
              status: 200,
              text: async () =>
                JSON.stringify({ login: 'sandbox-user', type: 'User' }),
            };
          }

          throw new Error(`Unexpected fetch: ${String(url)}`);
        };

        return { fetchCalls, fetchImpl };
      },
      assert: async (context) => {
        await expect(
          loadLiveLabEnvironment(
            {
              LIVE_TEST_DISCORD_APPLICATION_ID: 'app-1',
              LIVE_TEST_DISCORD_BOT_TOKEN: 'bot-token-1',
              LIVE_TEST_DISCORD_GUILD_ID: 'guild-1',
              LIVE_TEST_DISCORD_PUBLIC_KEY: 'public-key-1',
              LIVE_TEST_GITHUB_APP_CLIENT_ID: 'client-id-1',
              LIVE_TEST_GITHUB_APP_PRIVATE_KEY: liveLabAppPrivateKey,
              LIVE_TEST_GITHUB_ORG: 'sandbox-user',
              LIVE_TEST_SONAR_ORGANIZATION: 'sandbox-sonar',
              LIVE_TEST_SONAR_TOKEN: 'sonar-token-1',
            },
            {
              fetchImpl: context.fetchImpl,
            },
          ),
        ).rejects.toThrow(
          'LIVE_TEST_GITHUB_TOKEN is required when LIVE_TEST_GITHUB_ORG points to a user account.',
        );
        expect(context.fetchCalls).toEqual([
          expect.objectContaining({
            headers: expect.objectContaining({
              authorization: expect.stringMatching(/^Bearer /u),
            }),
            method: 'GET',
            url: 'https://api.github.com/users/sandbox-user',
          }),
        ]);
      },
    },
    {
      name: 'lists paginated GitHub repositories until the final partial page',
      inputs: {},
      mock: async () => {
        const githubCalls = [];
        const firstPage = Array.from({ length: 100 }, (_, index) => ({
          created_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
          name: `devplat-test-${String(index + 1)}-1`,
        }));
        const secondPage = [
          {
            created_at: '2026-04-30T12:00:00.000Z',
            name: 'devplat-test-101-1',
          },
        ];

        return {
          githubCalls,
          githubRequest: async (path) => {
            githubCalls.push(path);

            if (
              path ===
              '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100'
            ) {
              return firstPage;
            }
            if (
              path ===
              '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100&page=2'
            ) {
              return secondPage;
            }

            throw new Error(`Unexpected GitHub request: ${path}`);
          },
        };
      },
      assert: async (context) => {
        const repositories = await listGitHubRepositories({
          githubOwner: 'sandbox-org',
          githubOwnerKind: 'organization',
          githubRequest: context.githubRequest,
        });

        expect(repositories).toHaveLength(101);
        expect(context.githubCalls).toEqual([
          '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
          '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100&page=2',
        ]);
      },
    },
    {
      name: 'resolves GitHub owner kinds and routes repository endpoints',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const orgCalls = [];
        const orgGithubRequest = async (path) => {
          orgCalls.push(path);

          if (path === '/orgs/sandbox-org') {
            return { login: 'sandbox-org' };
          }

          throw new Error(`Unexpected GitHub request: ${path}`);
        };
        const userCalls = [];
        const userGithubRequest = async (path) => {
          userCalls.push(path);

          if (path === '/orgs/sandbox-user') {
            throw new Error(
              'Request to https://api.github.com/orgs/sandbox-user failed with HTTP 404: {"message":"Not Found"}',
            );
          }
          if (path === '/users/sandbox-user') {
            return { login: 'sandbox-user', type: 'User' };
          }

          throw new Error(`Unexpected GitHub request: ${path}`);
        };

        await expect(
          resolveGitHubOwnerKind({
            githubOwner: 'sandbox-org',
            githubRequest: orgGithubRequest,
          }),
        ).resolves.toBe('organization');
        await expect(
          resolveGitHubOwnerKind({
            githubOwner: 'sandbox-user',
            githubRequest: userGithubRequest,
          }),
        ).resolves.toBe('user');

        expect(
          createGitHubRepositoryListPath({
            githubOwner: 'sandbox-org',
            githubOwnerKind: 'organization',
          }),
        ).toBe(
          '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
        );
        expect(
          createGitHubRepositoryListPath({
            githubOwner: 'sandbox-user',
            githubOwnerKind: 'user',
          }),
        ).toBe(
          '/users/sandbox-user/repos?type=owner&sort=created&direction=asc&per_page=100',
        );
        expect(
          createGitHubRepositoryListPath({
            githubOwner: 'sandbox-org',
            githubOwnerKind: 'organization',
            page: 2,
          }),
        ).toBe(
          '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100&page=2',
        );
        expect(
          createGitHubRepositoryCreatePath({
            githubOwner: 'sandbox-org',
            githubOwnerKind: 'organization',
          }),
        ).toBe('/orgs/sandbox-org/repos');
        expect(
          createGitHubRepositoryCreatePath({
            githubOwner: 'sandbox-user',
            githubOwnerKind: 'user',
          }),
        ).toBe('/user/repos');
        expect(orgCalls).toEqual(['/orgs/sandbox-org']);
        expect(userCalls).toEqual([
          '/orgs/sandbox-user',
          '/users/sandbox-user',
        ]);
      },
    },
    {
      name: 'collects fixture files recursively with readme first',
      inputs: {},
      mock: async () => {
        const fixtureRoot = await mkdtemp(
          resolve(tmpdir(), 'devplat-live-fixture-'),
        );
        temporaryRoots.push(fixtureRoot);
        await mkdir(resolve(fixtureRoot, '.github/workflows'), {
          recursive: true,
        });
        await writeFile(
          resolve(fixtureRoot, 'README.md'),
          '# Fixture\n',
          'utf8',
        );
        await writeFile(
          resolve(fixtureRoot, '.github/workflows/test.yml'),
          'name: Test\n',
          'utf8',
        );
        await writeFile(resolve(fixtureRoot, 'notes.txt'), 'notes\n', 'utf8');

        return { fixtureRoot };
      },
      assert: async (context) => {
        const files = await collectFixtureFiles(context.fixtureRoot);

        expect(files.map((file) => file.path)).toEqual([
          'README.md',
          '.github/workflows/test.yml',
          'notes.txt',
        ]);
      },
    },
    {
      name: 'runs the CLI entrypoint with injected collaborators',
      inputs: {
        argv: [
          '--ref',
          'release-candidate',
          '--max-parallel-repos',
          '8',
          '--operator-hold-ms',
          '120000',
        ],
      },
      mock: async () => {
        const writes = [];

        return { writes };
      },
      assert: async (context, inputs) => {
        let capturedOptions = null;
        const reportDirectory = resolve(tmpdir(), 'devplat-live-lab-report');
        const environment = {
          github: {
            organization: 'sandbox-org',
            token: 'github-token-1',
          },
        };
        const report = await runLiveLabCommand(inputs.argv, {
          createEnvironment: async () => environment,
          runLiveLabFn: async (options) => {
            capturedOptions = options;

            return {
              completedAt: '2026-04-19T04:00:00.000Z',
              github: {
                repoFullName: 'sandbox-org/devplat-test-300-1',
              },
              reportDirectory,
              runLabel: '300-1',
              status: 'passed',
            };
          },
          writeOutput: (value) => {
            context.writes.push(value);
          },
        });

        expect(capturedOptions).toMatchObject({
          environment,
          maxParallelRepos: 8,
          operatorHoldMs: 120000,
          ref: 'release-candidate',
        });
        expect(report.status).toBe('passed');
        expect(JSON.parse(context.writes[0])).toEqual({
          completedAt: '2026-04-19T04:00:00.000Z',
          reportDirectory,
          repository: 'sandbox-org/devplat-test-300-1',
          runLabel: '300-1',
          status: 'passed',
        });
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = (await testCase.mock()) ?? {};
    await testCase.assert(context, testCase.inputs);
  });
});

describe('runLiveLab', () => {
  const baseEnvironment = {
    discord: {
      applicationId: 'app-1',
      categoryName: 'test',
      baseUrl: 'https://discord.example/api/v10',
      botToken: 'bot-token-1',
      guildId: 'guild-1',
      publicKey: 'public-key-1',
    },
    github: {
      organization: 'sandbox-org',
      token: 'github-token-1',
    },
    githubWorkflow: {
      ref: 'main',
      repository: 'VannaDii/devplat',
      runAttempt: '1',
      runId: '9001',
      runNumber: '200',
      serverUrl: 'https://github.com',
      sha: 'abc123',
      stepSummaryPath: null,
    },
    sonar: {
      baseUrl: 'https://sonar.example',
      organization: 'sandbox-sonar',
      token: 'sonar-token-1',
    },
  };

  const cases = [
    {
      name: 'runs the full live lab and cleans up repo resources on success',
      inputs: {
        ref: 'refs/heads/release-candidate',
        retainFailedResources: false,
      },
      mock: async () => {
        const reportDir = await mkdtemp(resolve(tmpdir(), 'devplat-live-lab-'));
        temporaryRoots.push(reportDir);
        const summaryEntries = [];
        const githubCalls = [];
        const discordCalls = [];
        const discordMessages = [];
        const sonarCalls = [];
        const sharedDiscordChannels = [
          { id: 'test-category', name: 'test', type: 4 },
          {
            id: 'uncategorized-project-management-1',
            name: 'project-management',
            parent_id: null,
            type: 0,
          },
          { id: 'spec-1', name: 'spec', parent_id: 'test-category', type: 0 },
          {
            id: 'implementation-1',
            name: 'implementation',
            parent_id: 'test-category',
            type: 0,
          },
          {
            id: 'pull-request-1',
            name: 'pull-request',
            parent_id: 'test-category',
            type: 0,
          },
          { id: 'audit-1', name: 'audit', parent_id: 'test-category', type: 0 },
          {
            id: 'project-management-1',
            name: 'project-management',
            parent_id: 'test-category',
            type: 0,
          },
        ];
        const fixtureFiles = [
          { path: 'README.md', content: '# Fixture\n' },
          {
            path: '.github/workflows/live-dispatch-canary.yml',
            content: 'name: Canary\n',
          },
        ];

        const githubRoutes = new Map([
          ['GET /orgs/sandbox-org', { login: 'sandbox-org' }],
          [
            'GET /orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
            [],
          ],
          [
            'POST /orgs/sandbox-org/repos',
            {
              created_at: '2026-04-16T00:00:00.000Z',
              full_name: 'sandbox-org/devplat-test-200-1',
              html_url: 'https://github.com/sandbox-org/devplat-test-200-1',
              name: 'devplat-test-200-1',
            },
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/selected-actions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/workflow',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/interaction-limits',
            { limit: 'collaborators_only' },
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1',
            { default_branch: 'main' },
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/git/ref/heads/main',
            { object: { sha: 'sha-main-1' } },
          ],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/git/refs',
            { ref: 'refs/heads/live-test/200-1' },
          ],
          ['POST /repos/sandbox-org/devplat-test-200-1/pulls', { number: 42 }],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/dispatches',
            {
              html_url:
                'https://github.com/sandbox-org/devplat-test-200-1/actions/runs/1',
              run_url:
                'https://api.github.com/repos/sandbox-org/devplat-test-200-1/actions/runs/1',
              workflow_run_id: 1,
            },
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/runs?branch=live-test%2F200-1&event=workflow_dispatch&per_page=10',
            {
              workflow_runs: [
                {
                  conclusion: 'success',
                  html_url:
                    'https://github.com/sandbox-org/devplat-test-200-1/actions/runs/1',
                  id: 1,
                  status: 'completed',
                },
              ],
            },
          ],
          [
            'PATCH /repos/sandbox-org/devplat-test-200-1/pulls/42',
            { number: 42, state: 'closed' },
          ],
          ['DELETE /repos/sandbox-org/devplat-test-200-1', null],
        ]);
        const githubRequest = createTrackedRouteHandler(
          'GitHub',
          githubCalls,
          githubRoutes,
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/README.md',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/README.md',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/.github/workflows/live-dispatch-canary.yml',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/.github/workflows/live-dispatch-canary.yml',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
            },
          },
        );

        const discordRequest = async (path, options = {}) => {
          discordCalls.push([path, options.method ?? 'GET']);

          if (path === '/guilds/guild-1' && options.method === undefined) {
            return { id: 'guild-1' };
          }
          if (
            path === '/guilds/guild-1/channels' &&
            options.method === undefined
          ) {
            return sharedDiscordChannels;
          }
          if (
            path === '/guilds/guild-1/channels' &&
            options.method === 'POST'
          ) {
            throw new Error(
              'Shared live-lab channels should have been reused.',
            );
          }
          if (
            path.startsWith('/channels/') &&
            path.endsWith('/messages') &&
            options.method === 'POST'
          ) {
            discordMessages.push(options.body);
            return { id: `message-${discordCalls.length}` };
          }

          throw new Error(
            `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
          );
        };

        const sonarRequest = async (path, options = {}) => {
          sonarCalls.push([path, options.method ?? 'GET']);

          if (
            path === '/api/projects/search?organization=sandbox-sonar&ps=1' &&
            options.method === undefined
          ) {
            return { components: [] };
          }
          if (
            path ===
              '/api/projects/search?organization=sandbox-sonar&projects=sandbox-org_devplat-test-200-1' &&
            options.method === undefined
          ) {
            return {
              components: [
                { key: 'sandbox-org_devplat-test-200-1', name: 'fixture' },
              ],
            };
          }
          if (
            path ===
              '/api/projects/delete?project=sandbox-org_devplat-test-200-1' &&
            options.method === 'POST'
          ) {
            return null;
          }

          throw new Error(
            `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
          );
        };

        const runDeepTestMock = async (_options, deps) => {
          await deps.onProgress({
            message: 'Planning slice work.',
            phase: 'planning',
            step: 'create_slice_plan',
          });
          await deps.onProgress({
            message: 'Updating pull request state.',
            phase: 'delivery',
            step: 'submit_pull_request_update',
          });

          return {
            reportDirectory: resolve(reportDir, 'deep-test'),
            steps: [
              { tool: 'resolve_runtime_config' },
              { tool: 'validate_artifact' },
            ],
          };
        };
        const runDiscordInteractionProbeMock = async () => ({
          action: 'retry-gates',
          allowed: true,
          commandName: 'retry-gates',
          failedClosed: false,
          interactionEndpoint: '/interactions/live-lab/token/callback',
          policyDecisionId: 'policy-retry-gates',
          threadEndpoint: '/channels/implementation-1/messages',
          threadId: 'implementation-1',
        });
        const registerDiscordApplicationCommandsMock =
          createRegisterDiscordApplicationCommandsMock();

        return {
          collectFixtureFiles: async () => fixtureFiles,
          discordCalls,
          discordMessages,
          discordRequest,
          githubCalls,
          githubRequest,
          reportDir,
          registerDiscordApplicationCommandsMock,
          runDeepTestMock,
          runDiscordInteractionProbeMock,
          sonarCalls,
          sonarRequest,
          summaryEntries,
        };
      },
      assert: async (context, inputs) => {
        const report = await runLiveLab(
          {
            environment: baseEnvironment,
            maxParallelRepos: 6,
            ref: inputs.ref,
            reportDir: context.reportDir,
            retainFailedResources: inputs.retainFailedResources,
            skipBuild: true,
          },
          {
            appendSummary: async (_path, content) => {
              context.summaryEntries.push(content);
            },
            collectFixtureFiles: context.collectFixtureFiles,
            discordRequest: context.discordRequest,
            githubRequest: context.githubRequest,
            registerDiscordApplicationCommands:
              context.registerDiscordApplicationCommandsMock,
            runDeepTest: context.runDeepTestMock,
            runDiscordInteractionProbe: context.runDiscordInteractionProbeMock,
            sonarRequest: context.sonarRequest,
          },
        );

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDir, 'live-lab-report.json'),
            'utf8',
          ),
        );

        expect(report.status).toBe('passed');
        expect(savedReport.ref).toBe(inputs.ref);
        expect(savedReport.cleanup).toMatchObject({
          repository: { status: 'deleted' },
          sonarProject: { status: 'deleted' },
        });
        expect(savedReport.github.repoFullName).toBe(
          'sandbox-org/devplat-test-200-1',
        );
        expect(savedReport.deepTest.steps).toBe(2);
        expect(savedReport.discord.interactionProbe).toMatchObject({
          action: 'retry-gates',
          failedClosed: false,
          threadId: 'implementation-1',
        });
        expect(savedReport.discord.commandRegistration).toMatchObject({
          count: 14,
          endpoint: '/applications/app-1/guilds/guild-1/commands',
        });
        expect(savedReport.discord.bootstrapStatus).toMatchObject({
          channelId: 'project-management-1',
          componentCustomIds: [],
          content: expect.stringContaining('🟡 DevPlat · Live lab bootstrap'),
          endpoint: '/channels/project-management-1/messages',
          messageId: expect.any(String),
        });
        expect(savedReport.discord.channels.projectManagement).toEqual({
          id: 'project-management-1',
          name: 'project-management',
          parentId: 'test-category',
        });
        expect(context.githubCalls).toEqual(
          expect.arrayContaining([
            ['/orgs/sandbox-org/repos', 'POST'],
            ['/repos/sandbox-org/devplat-test-200-1/pulls', 'POST'],
            ['/repos/sandbox-org/devplat-test-200-1', 'DELETE'],
          ]),
        );
        expect(context.sonarCalls).toEqual(
          expect.arrayContaining([
            [
              '/api/projects/delete?project=sandbox-org_devplat-test-200-1',
              'POST',
            ],
          ]),
        );
        expect(context.discordCalls).toEqual(
          expect.arrayContaining([
            ['/guilds/guild-1/channels', 'GET'],
            ['/channels/spec-1/messages', 'POST'],
            ['/channels/pull-request-1/messages', 'POST'],
          ]),
        );
        expect(context.discordCalls).not.toContainEqual([
          '/guilds/guild-1/channels',
          'POST',
        ]);
        expect(context.discordMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              allowed_mentions: { parse: [] },
              content: expect.stringContaining(`Ref: ${inputs.ref}`),
              flags: 4,
            }),
            expect.objectContaining({
              content: expect.stringContaining(
                '→ Bootstrapped the shared live-lab channels and external service preflight.',
              ),
            }),
          ]),
        );
        const discordMessageLines = context.discordMessages.flatMap((message) =>
          message.content.split('\n'),
        );
        expect(
          discordMessageLines.some(
            (line) => line.startsWith('Workflow: <') && line.endsWith('>'),
          ),
        ).toBe(true);
        expect(context.summaryEntries[0]).toContain('Status: passed');
        expect(context.summaryEntries[0]).toContain(`Ref: ${inputs.ref}`);
        expect(context.summaryEntries[0]).toContain('Discord category: test');
        expect(context.summaryEntries[0]).toContain(
          'Discord channels: spec, implementation, pull-request, audit, project-management',
        );
      },
    },
    {
      name: 'fails before repository mutation when the bootstrap Discord status cannot post',
      inputs: {
        ref: 'main',
        retainFailedResources: false,
      },
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-live-lab-bootstrap-status-'),
        );
        temporaryRoots.push(reportDir);
        const discordCalls = [];
        const githubCalls = [];
        const sonarCalls = [];
        const sharedDiscordChannels = [
          { id: 'test-category', name: 'test', type: 4 },
          { id: 'spec-1', name: 'spec', parent_id: 'test-category', type: 0 },
          {
            id: 'implementation-1',
            name: 'implementation',
            parent_id: 'test-category',
            type: 0,
          },
          {
            id: 'pull-request-1',
            name: 'pull-request',
            parent_id: 'test-category',
            type: 0,
          },
          { id: 'audit-1', name: 'audit', parent_id: 'test-category', type: 0 },
          {
            id: 'project-management-1',
            name: 'project-management',
            parent_id: 'test-category',
            type: 0,
          },
        ];
        const githubRoutes = new Map([
          ['GET /orgs/sandbox-org', { login: 'sandbox-org' }],
          [
            'GET /orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
            () => {
              throw new Error(
                'Live lab continued after Discord bootstrap status failed.',
              );
            },
          ],
        ]);
        const githubRequest = createTrackedRouteHandler(
          'GitHub',
          githubCalls,
          githubRoutes,
        );
        const discordRequest = async (path, options = {}) => {
          discordCalls.push([path, options.method ?? 'GET']);

          if (path === '/guilds/guild-1' && options.method === undefined) {
            return { id: 'guild-1' };
          }
          if (
            path === '/guilds/guild-1/channels' &&
            options.method === undefined
          ) {
            return sharedDiscordChannels;
          }
          if (
            path === '/channels/project-management-1/messages' &&
            options.method === 'POST'
          ) {
            throw new Error('Discord bootstrap status failed.');
          }
          if (
            path === '/channels/audit-1/messages' &&
            options.method === 'POST'
          ) {
            return { id: 'failure-message-1' };
          }

          throw new Error(
            `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
          );
        };
        const sonarRequest = async (path, options = {}) => {
          sonarCalls.push([path, options.method ?? 'GET']);

          if (
            path === '/api/projects/search?organization=sandbox-sonar&ps=1' &&
            options.method === undefined
          ) {
            return { components: [] };
          }

          throw new Error(
            `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
          );
        };
        const registerDiscordApplicationCommandsMock =
          createRegisterDiscordApplicationCommandsMock();

        return {
          discordCalls,
          discordRequest,
          githubCalls,
          githubRequest,
          registerDiscordApplicationCommandsMock,
          reportDir,
          sonarCalls,
          sonarRequest,
        };
      },
      assert: async (context, inputs) => {
        await expect(
          runLiveLab(
            {
              environment: baseEnvironment,
              maxParallelRepos: 6,
              ref: inputs.ref,
              reportDir: context.reportDir,
              retainFailedResources: inputs.retainFailedResources,
              skipBuild: true,
            },
            {
              appendSummary: async () => undefined,
              collectFixtureFiles: async () => [],
              discordRequest: context.discordRequest,
              githubRequest: context.githubRequest,
              registerDiscordApplicationCommands:
                context.registerDiscordApplicationCommandsMock,
              runDeepTest: async () => ({
                reportDirectory: context.reportDir,
                steps: [],
              }),
              runDiscordInteractionProbe: async () => ({
                allowed: true,
                failedClosed: false,
              }),
              sonarRequest: context.sonarRequest,
            },
          ),
        ).rejects.toThrow('Discord bootstrap status failed.');

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDir, 'live-lab-report.json'),
            'utf8',
          ),
        );

        expect(savedReport.status).toBe('failed');
        expect(savedReport.error.message).toBe(
          'Discord bootstrap status failed.',
        );
        expect(context.githubCalls).not.toContainEqual([
          '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
          'GET',
        ]);
        expect(context.discordCalls).toEqual(
          expect.arrayContaining([
            ['/channels/project-management-1/messages', 'POST'],
            ['/channels/audit-1/messages', 'POST'],
          ]),
        );
      },
    },
    {
      name: 'creates a Sonar project directly for user-owned live labs',
      inputs: {
        ref: 'main',
        retainFailedResources: false,
      },
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-live-lab-user-owner-'),
        );
        temporaryRoots.push(reportDir);
        const discordCalls = [];
        const createdDiscordChannels = [];
        const githubCalls = [];
        const runtimeEvents = [];
        const sonarCalls = [];
        const discordChannelResponses = [
          { id: 'test-category', name: 'test', type: 4 },
          { id: 'spec-1', name: 'spec', parent_id: 'test-category', type: 0 },
          {
            id: 'implementation-1',
            name: 'implementation',
            parent_id: 'test-category',
            type: 0,
          },
          {
            id: 'pull-request-1',
            name: 'pull-request',
            parent_id: 'test-category',
            type: 0,
          },
          { id: 'audit-1', name: 'audit', parent_id: 'test-category', type: 0 },
          {
            id: 'project-management-1',
            name: 'project-management',
            parent_id: 'test-category',
            type: 0,
          },
        ];

        const githubRoutes = new Map([
          [
            'GET /orgs/sandbox-user',
            () => {
              throw new Error(
                'Request to https://api.github.com/orgs/sandbox-user failed (HTTP 404): {"message":"Not Found"}',
              );
            },
          ],
          ['GET /users/sandbox-user', { login: 'sandbox-user', type: 'User' }],
          [
            'GET /users/sandbox-user/repos?type=owner&sort=created&direction=asc&per_page=100',
            [],
          ],
          [
            'POST /user/repos',
            {
              created_at: '2026-04-16T00:00:00.000Z',
              full_name: 'sandbox-user/devplat-test-200-1',
              html_url: 'https://github.com/sandbox-user/devplat-test-200-1',
              name: 'devplat-test-200-1',
            },
          ],
          [
            'PUT /repos/sandbox-user/devplat-test-200-1/actions/permissions',
            null,
          ],
          [
            'PUT /repos/sandbox-user/devplat-test-200-1/actions/permissions/selected-actions',
            null,
          ],
          [
            'PUT /repos/sandbox-user/devplat-test-200-1/actions/permissions/workflow',
            null,
          ],
          [
            'PUT /repos/sandbox-user/devplat-test-200-1/interaction-limits',
            { limit: 'collaborators_only' },
          ],
          [
            'GET /repos/sandbox-user/devplat-test-200-1',
            { default_branch: 'main' },
          ],
          [
            'GET /repos/sandbox-user/devplat-test-200-1/git/ref/heads/main',
            { object: { sha: 'sha-main-1' } },
          ],
          [
            'POST /repos/sandbox-user/devplat-test-200-1/git/refs',
            { ref: 'refs/heads/live-test/200-1' },
          ],
          ['POST /repos/sandbox-user/devplat-test-200-1/pulls', { number: 42 }],
          [
            'POST /repos/sandbox-user/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/dispatches',
            {
              html_url:
                'https://github.com/sandbox-user/devplat-test-200-1/actions/runs/1',
              run_url:
                'https://api.github.com/repos/sandbox-user/devplat-test-200-1/actions/runs/1',
              workflow_run_id: 1,
            },
          ],
          [
            'GET /repos/sandbox-user/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/runs?branch=live-test%2F200-1&event=workflow_dispatch&per_page=10',
            {
              workflow_runs: [
                {
                  conclusion: 'success',
                  html_url:
                    'https://github.com/sandbox-user/devplat-test-200-1/actions/runs/1',
                  id: 1,
                  status: 'completed',
                },
              ],
            },
          ],
          [
            'PATCH /repos/sandbox-user/devplat-test-200-1/pulls/42',
            { number: 42, state: 'closed' },
          ],
          ['DELETE /repos/sandbox-user/devplat-test-200-1', null],
        ]);
        const githubRequest = createTrackedRouteHandler(
          'GitHub',
          githubCalls,
          githubRoutes,
        );
        githubRoutes.set(
          'PUT /repos/sandbox-user/devplat-test-200-1/contents/README.md',
          {
            content: {
              path: '/repos/sandbox-user/devplat-test-200-1/contents/README.md',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-user/devplat-test-200-1/contents/.github/workflows/live-dispatch-canary.yml',
          {
            content: {
              path: '/repos/sandbox-user/devplat-test-200-1/contents/.github/workflows/live-dispatch-canary.yml',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-user/devplat-test-200-1/contents/.live-test/200-1/canary.json',
          {
            content: {
              path: '/repos/sandbox-user/devplat-test-200-1/contents/.live-test/200-1/canary.json',
            },
          },
        );

        const sonarRequest = async (path, options = {}) => {
          sonarCalls.push([path, options.method ?? 'GET']);

          if (
            path === '/api/projects/search?organization=sandbox-sonar&ps=1' &&
            options.method === undefined
          ) {
            return { components: [] };
          }
          if (
            path ===
              '/api/projects/create?organization=sandbox-sonar&project=sandbox-user_devplat-test-200-1&name=devplat-test-200-1' &&
            options.method === 'POST'
          ) {
            return {
              project: {
                key: 'sandbox-user_devplat-test-200-1',
                name: 'devplat-test-200-1',
              },
            };
          }
          if (
            path ===
              '/api/projects/delete?project=sandbox-user_devplat-test-200-1' &&
            options.method === 'POST'
          ) {
            return null;
          }

          throw new Error(
            `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
          );
        };

        return {
          discordRequest: async (path, options = {}) => {
            discordCalls.push([path, options.method ?? 'GET']);

            if (path === '/guilds/guild-1' && options.method === undefined) {
              return { id: 'guild-1' };
            }
            if (
              path === '/guilds/guild-1/channels' &&
              options.method === undefined
            ) {
              return [];
            }
            if (
              path === '/guilds/guild-1/channels' &&
              options.method === 'POST'
            ) {
              createdDiscordChannels.push(options.body);
              return discordChannelResponses.shift();
            }
            if (
              path.startsWith('/channels/') &&
              path.endsWith('/messages') &&
              options.method === 'POST'
            ) {
              return { id: 'message-1' };
            }

            throw new Error(
              `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          discordCalls,
          createdDiscordChannels,
          githubCalls,
          githubRequest,
          reportDir,
          registerDiscordApplicationCommandsMock:
            createRegisterDiscordApplicationCommandsMock(),
          runDiscordInteractionProbeMock: async () => {
            runtimeEvents.push('interaction-probe');

            return {
              action: 'retry-gates',
              allowed: true,
              commandName: 'retry-gates',
              failedClosed: false,
              interactionEndpoint: '/interactions/live-lab/token/callback',
              policyDecisionId: 'policy-retry-gates',
              threadEndpoint: '/channels/implementation-1/messages',
              threadId: 'implementation-1',
            };
          },
          runDeepTestMock: async (options) => {
            runtimeEvents.push('deep-test');
            await options.beforeCleanup();
            runtimeEvents.push('cleanup-ready');

            return {
              reportDirectory: resolve(reportDir, 'deep-test'),
              steps: [{ tool: 'verify_sonar_bootstrap' }],
            };
          },
          runtimeEvents,
          sonarCalls,
          sonarRequest,
          summaryEntries: [],
        };
      },
      assert: async (context, inputs) => {
        const report = await runLiveLab(
          {
            environment: {
              ...baseEnvironment,
              github: {
                organization: 'sandbox-user',
                token: 'github-token-1',
              },
            },
            maxParallelRepos: 6,
            ref: inputs.ref,
            reportDir: context.reportDir,
            retainFailedResources: inputs.retainFailedResources,
            skipBuild: true,
          },
          {
            appendSummary: async (_path, content) => {
              context.summaryEntries.push(content);
            },
            collectFixtureFiles: async () => [
              { path: 'README.md', content: '# Fixture\n' },
              {
                path: '.github/workflows/live-dispatch-canary.yml',
                content: 'name: Canary\n',
              },
            ],
            discordRequest: context.discordRequest,
            githubRequest: context.githubRequest,
            registerDiscordApplicationCommands:
              context.registerDiscordApplicationCommandsMock,
            runDeepTest: context.runDeepTestMock,
            runDiscordInteractionProbe: context.runDiscordInteractionProbeMock,
            sleep: async (delayMs) => {
              context.runtimeEvents.push(`hold:${String(delayMs)}`);
            },
            sonarRequest: context.sonarRequest,
          },
        );

        expect(report.status).toBe('passed');
        expect(report.discord.interactionProbe).toMatchObject({
          action: 'retry-gates',
          failedClosed: false,
        });
        expect(context.runtimeEvents).toEqual([
          'deep-test',
          'interaction-probe',
          'hold:150000',
          'cleanup-ready',
        ]);
        expect(report.sonar).toEqual({
          projectKey: 'sandbox-user_devplat-test-200-1',
          projectName: 'devplat-test-200-1',
        });
        expect(report.cleanup).toMatchObject({
          repository: { status: 'deleted' },
          sonarProject: { status: 'deleted' },
        });
        expect(context.githubCalls).toEqual(
          expect.arrayContaining([
            ['/users/sandbox-user', 'GET'],
            ['/user/repos', 'POST'],
          ]),
        );
        expect(context.discordCalls).toEqual(
          expect.arrayContaining([
            ['/guilds/guild-1/channels', 'GET'],
            ['/guilds/guild-1/channels', 'POST'],
          ]),
        );
        /**
         * `parent_id` is the Discord channel creation wire key for category nesting.
         */
        expect(context.createdDiscordChannels).toEqual([
          { name: 'test', type: 4 },
          { name: 'spec', parent_id: 'test-category', type: 0 },
          { name: 'implementation', parent_id: 'test-category', type: 0 },
          { name: 'pull-request', parent_id: 'test-category', type: 0 },
          { name: 'audit', parent_id: 'test-category', type: 0 },
          { name: 'project-management', parent_id: 'test-category', type: 0 },
        ]);
        expect(context.sonarCalls).toEqual(
          expect.arrayContaining([
            [
              '/api/projects/create?organization=sandbox-sonar&project=sandbox-user_devplat-test-200-1&name=devplat-test-200-1',
              'POST',
            ],
            [
              '/api/projects/delete?project=sandbox-user_devplat-test-200-1',
              'POST',
            ],
          ]),
        );
      },
    },
    {
      name: 'fails the run when repository cleanup fails after a successful deep test',
      inputs: {},
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-live-lab-cleanup-failure-'),
        );
        temporaryRoots.push(reportDir);
        const summaryEntries = [];
        const githubCalls = [];
        const sharedDiscordChannels = [
          { id: 'test-category', name: 'test', type: 4 },
          { id: 'spec-1', name: 'spec', parent_id: 'test-category', type: 0 },
          {
            id: 'implementation-1',
            name: 'implementation',
            parent_id: 'test-category',
            type: 0,
          },
          {
            id: 'pull-request-1',
            name: 'pull-request',
            parent_id: 'test-category',
            type: 0,
          },
          { id: 'audit-1', name: 'audit', parent_id: 'test-category', type: 0 },
          {
            id: 'project-management-1',
            name: 'project-management',
            parent_id: 'test-category',
            type: 0,
          },
        ];

        const githubRoutes = new Map([
          ['GET /orgs/sandbox-org', { login: 'sandbox-org' }],
          [
            'GET /orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
            [],
          ],
          [
            'POST /orgs/sandbox-org/repos',
            {
              created_at: '2026-04-16T00:00:00.000Z',
              full_name: 'sandbox-org/devplat-test-200-1',
              html_url: 'https://github.com/sandbox-org/devplat-test-200-1',
              name: 'devplat-test-200-1',
            },
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/selected-actions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/workflow',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/interaction-limits',
            { limit: 'collaborators_only' },
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1',
            { default_branch: 'main' },
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/git/ref/heads/main',
            { object: { sha: 'sha-main-1' } },
          ],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/git/refs',
            { ref: 'refs/heads/live-test/200-1' },
          ],
          ['POST /repos/sandbox-org/devplat-test-200-1/pulls', { number: 42 }],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/dispatches',
            null,
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/runs?branch=live-test%2F200-1&event=workflow_dispatch&per_page=10',
            {
              workflow_runs: [
                {
                  conclusion: 'success',
                  html_url:
                    'https://github.com/sandbox-org/devplat-test-200-1/actions/runs/1',
                  id: 1,
                  status: 'completed',
                },
              ],
            },
          ],
          [
            'PATCH /repos/sandbox-org/devplat-test-200-1/pulls/42',
            { number: 42, state: 'closed' },
          ],
        ]);
        const githubRequest = createTrackedRouteHandler(
          'GitHub',
          githubCalls,
          githubRoutes,
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/README.md',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/README.md',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/.github/workflows/live-dispatch-canary.yml',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/.github/workflows/live-dispatch-canary.yml',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
            },
          },
        );
        githubRoutes.set('DELETE /repos/sandbox-org/devplat-test-200-1', () => {
          throw new Error('repo cleanup failed');
        });

        return {
          discordRequest: async (path, options = {}) => {
            if (path === '/guilds/guild-1' && options.method === undefined) {
              return { id: 'guild-1' };
            }
            if (
              path === '/guilds/guild-1/channels' &&
              options.method === undefined
            ) {
              return sharedDiscordChannels;
            }
            if (
              path === '/guilds/guild-1/channels' &&
              options.method === 'POST'
            ) {
              throw new Error(
                'Shared live-lab channels should have been reused.',
              );
            }
            if (
              path.startsWith('/channels/') &&
              path.endsWith('/messages') &&
              options.method === 'POST'
            ) {
              return { id: 'message-1' };
            }

            throw new Error(
              `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          githubRequest,
          reportDir,
          registerDiscordApplicationCommandsMock:
            createRegisterDiscordApplicationCommandsMock(),
          runDeepTestMock: async () => ({
            reportDirectory: resolve(reportDir, 'deep-test'),
            steps: [{ tool: 'resolve_runtime_config' }],
          }),
          runDiscordInteractionProbeMock: async () => ({
            action: 'retry-gates',
            allowed: true,
            commandName: 'retry-gates',
            failedClosed: false,
            interactionEndpoint: '/interactions/live-lab/token/callback',
            policyDecisionId: 'policy-retry-gates',
            threadEndpoint: '/channels/implementation-1/messages',
            threadId: 'implementation-1',
          }),
          sonarRequest: async (path, options = {}) => {
            if (
              path === '/api/projects/search?organization=sandbox-sonar&ps=1' &&
              options.method === undefined
            ) {
              return { components: [] };
            }
            if (
              path ===
                '/api/projects/search?organization=sandbox-sonar&projects=sandbox-org_devplat-test-200-1' &&
              options.method === undefined
            ) {
              return {
                components: [
                  { key: 'sandbox-org_devplat-test-200-1', name: 'fixture' },
                ],
              };
            }
            if (
              path ===
                '/api/projects/delete?project=sandbox-org_devplat-test-200-1' &&
              options.method === 'POST'
            ) {
              return null;
            }

            throw new Error(
              `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          summaryEntries,
        };
      },
      assert: async (context) => {
        await expect(
          runLiveLab(
            {
              environment: baseEnvironment,
              maxParallelRepos: 6,
              reportDir: context.reportDir,
              retainFailedResources: false,
              skipBuild: true,
            },
            {
              appendSummary: async (_path, content) => {
                context.summaryEntries.push(content);
              },
              collectFixtureFiles: async () => [
                { path: 'README.md', content: '# Fixture\n' },
                {
                  path: '.github/workflows/live-dispatch-canary.yml',
                  content: 'name: Canary\n',
                },
              ],
              discordRequest: context.discordRequest,
              githubRequest: context.githubRequest,
              registerDiscordApplicationCommands:
                context.registerDiscordApplicationCommandsMock,
              runDeepTest: context.runDeepTestMock,
              runDiscordInteractionProbe:
                context.runDiscordInteractionProbeMock,
              sonarRequest: context.sonarRequest,
            },
          ),
        ).rejects.toThrow('Failed to delete live-lab repository');

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDir, 'live-lab-report.json'),
            'utf8',
          ),
        );

        expect(savedReport.status).toBe('failed');
        expect(savedReport.cleanup).toMatchObject({
          repository: { status: 'failed' },
          sonarProject: { status: 'deleted' },
        });
        expect(context.summaryEntries[0]).toContain('Status: failed');
      },
    },
    {
      name: 'tears down repo resources after a deep-test failure when retention is disabled',
      inputs: {},
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-live-lab-failure-'),
        );
        temporaryRoots.push(reportDir);
        const discordCalls = [];
        const githubCalls = [];
        const sonarCalls = [];
        const sharedDiscordChannels = [
          { id: 'test-category', name: 'test', type: 4 },
          { id: 'spec-1', name: 'spec', parent_id: 'test-category', type: 0 },
          {
            id: 'implementation-1',
            name: 'implementation',
            parent_id: 'test-category',
            type: 0,
          },
          {
            id: 'pull-request-1',
            name: 'pull-request',
            parent_id: 'test-category',
            type: 0,
          },
          { id: 'audit-1', name: 'audit', parent_id: 'test-category', type: 0 },
          {
            id: 'project-management-1',
            name: 'project-management',
            parent_id: 'test-category',
            type: 0,
          },
        ];

        const githubRoutes = new Map([
          ['GET /orgs/sandbox-org', { login: 'sandbox-org' }],
          [
            'GET /orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
            [
              {
                created_at: '2026-04-10T00:00:00.000Z',
                name: 'devplat-test-199-1',
              },
              {
                created_at: '2026-04-11T00:00:00.000Z',
                name: 'devplat-test-199-2',
              },
              {
                created_at: '2026-04-12T00:00:00.000Z',
                name: 'devplat-test-199-3',
              },
              {
                created_at: '2026-04-13T00:00:00.000Z',
                name: 'devplat-test-199-4',
              },
              {
                created_at: '2026-04-14T00:00:00.000Z',
                name: 'devplat-test-199-5',
              },
              {
                created_at: '2026-04-15T00:00:00.000Z',
                name: 'devplat-test-199-6',
              },
            ],
          ],
          ['DELETE /repos/sandbox-org/devplat-test-199-1', null],
          [
            'POST /orgs/sandbox-org/repos',
            {
              created_at: '2026-04-16T00:00:00.000Z',
              full_name: 'sandbox-org/devplat-test-200-1',
              html_url: 'https://github.com/sandbox-org/devplat-test-200-1',
              name: 'devplat-test-200-1',
            },
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/interaction-limits',
            { limit: 'collaborators_only' },
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/selected-actions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/workflow',
            null,
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1',
            { default_branch: 'main' },
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/git/ref/heads/main',
            { object: { sha: 'sha-main-1' } },
          ],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/git/refs',
            { ref: 'refs/heads/live-test/200-1' },
          ],
          ['POST /repos/sandbox-org/devplat-test-200-1/pulls', { number: 42 }],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/dispatches',
            null,
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/runs?branch=live-test%2F200-1&event=workflow_dispatch&per_page=10',
            {
              workflow_runs: [
                {
                  conclusion: 'success',
                  html_url:
                    'https://github.com/sandbox-org/devplat-test-200-1/actions/runs/1',
                  id: 1,
                  status: 'completed',
                },
              ],
            },
          ],
          [
            'PATCH /repos/sandbox-org/devplat-test-200-1/pulls/42',
            { number: 42, state: 'closed' },
          ],
          ['DELETE /repos/sandbox-org/devplat-test-200-1', null],
        ]);
        const githubRequest = createTrackedRouteHandler(
          'GitHub',
          githubCalls,
          githubRoutes,
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/README.md',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/README.md',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
            },
          },
        );

        const discordRequest = async (path, options = {}) => {
          discordCalls.push([path, options.method ?? 'GET']);

          if (path === '/guilds/guild-1' && options.method === undefined) {
            return { id: 'guild-1' };
          }
          if (
            path === '/guilds/guild-1/channels' &&
            options.method === undefined
          ) {
            return [
              ...sharedDiscordChannels,
              { id: 'old-category', name: 'devplat-test-199-1', type: 4 },
              {
                id: 'old-audit',
                name: 'audit',
                parent_id: 'old-category',
                type: 0,
              },
              {
                id: 'old-project-management',
                name: 'project-management',
                parent_id: 'old-category',
                type: 0,
              },
            ];
          }
          if (
            path.startsWith('/channels/') &&
            path.endsWith('/messages') &&
            options.method === 'POST'
          ) {
            return { id: 'message-1' };
          }

          throw new Error(
            `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
          );
        };

        const sonarRequest = async (path, options = {}) => {
          sonarCalls.push([path, options.method ?? 'GET']);

          if (
            path === '/api/projects/search?organization=sandbox-sonar&ps=1' &&
            options.method === undefined
          ) {
            return { components: [] };
          }
          if (
            path ===
              '/api/projects/search?organization=sandbox-sonar&projects=sandbox-org_devplat-test-200-1' &&
            options.method === undefined
          ) {
            return {
              components: [
                { key: 'sandbox-org_devplat-test-200-1', name: 'fixture' },
              ],
            };
          }
          if (
            path ===
              '/api/projects/delete?project=sandbox-org_devplat-test-199-1' &&
            options.method === 'POST'
          ) {
            return null;
          }
          if (
            path ===
              '/api/projects/delete?project=sandbox-org_devplat-test-200-1' &&
            options.method === 'POST'
          ) {
            return null;
          }

          throw new Error(
            `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
          );
        };

        return {
          discordCalls,
          discordRequest,
          githubCalls,
          githubRequest,
          reportDir,
          registerDiscordApplicationCommandsMock:
            createRegisterDiscordApplicationCommandsMock(),
          runDeepTestMock: async () => {
            throw new Error('deep test failed');
          },
          sonarCalls,
          sonarRequest,
        };
      },
      assert: async (context) => {
        await expect(
          runLiveLab(
            {
              environment: baseEnvironment,
              maxParallelRepos: 6,
              reportDir: context.reportDir,
              retainFailedResources: false,
              skipBuild: true,
            },
            {
              collectFixtureFiles: async () => [
                { path: 'README.md', content: '# Fixture\n' },
              ],
              discordRequest: context.discordRequest,
              githubRequest: context.githubRequest,
              registerDiscordApplicationCommands:
                context.registerDiscordApplicationCommandsMock,
              runDeepTest: context.runDeepTestMock,
              sonarRequest: context.sonarRequest,
            },
          ),
        ).rejects.toThrow('deep test failed');

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDir, 'live-lab-report.json'),
            'utf8',
          ),
        );

        expect(savedReport.status).toBe('failed');
        expect(savedReport.evictedRepository).toBe('devplat-test-199-1');
        expect(savedReport.cleanup).toMatchObject({
          repository: { status: 'deleted' },
          sonarProject: { status: 'deleted' },
        });
        expect(context.discordCalls).toEqual(
          expect.arrayContaining([
            ['/guilds/guild-1/channels', 'GET'],
            ['/channels/project-management-1/messages', 'POST'],
          ]),
        );
        expect(context.discordCalls).not.toContainEqual([
          '/guilds/guild-1/channels',
          'POST',
        ]);
        expect(context.githubCalls).toEqual(
          expect.arrayContaining([
            ['/repos/sandbox-org/devplat-test-199-1', 'DELETE'],
            ['/repos/sandbox-org/devplat-test-200-1', 'DELETE'],
          ]),
        );
        expect(context.sonarCalls).toEqual(
          expect.arrayContaining([
            [
              '/api/projects/delete?project=sandbox-org_devplat-test-199-1',
              'POST',
            ],
            [
              '/api/projects/delete?project=sandbox-org_devplat-test-200-1',
              'POST',
            ],
          ]),
        );
      },
    },
    {
      name: 'retains repo resources after a deep-test failure when retention is enabled',
      inputs: {},
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-live-lab-retained-failure-'),
        );
        temporaryRoots.push(reportDir);
        const discordCalls = [];
        const githubCalls = [];
        const sonarCalls = [];
        const sharedDiscordChannels = [
          { id: 'test-category', name: 'test', type: 4 },
          { id: 'spec-1', name: 'spec', parent_id: 'test-category', type: 0 },
          {
            id: 'implementation-1',
            name: 'implementation',
            parent_id: 'test-category',
            type: 0,
          },
          {
            id: 'pull-request-1',
            name: 'pull-request',
            parent_id: 'test-category',
            type: 0,
          },
          { id: 'audit-1', name: 'audit', parent_id: 'test-category', type: 0 },
          {
            id: 'project-management-1',
            name: 'project-management',
            parent_id: 'test-category',
            type: 0,
          },
        ];

        const githubRoutes = new Map([
          ['GET /orgs/sandbox-org', { login: 'sandbox-org' }],
          [
            'GET /orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
            [],
          ],
          [
            'POST /orgs/sandbox-org/repos',
            {
              created_at: '2026-04-16T00:00:00.000Z',
              full_name: 'sandbox-org/devplat-test-200-1',
              html_url: 'https://github.com/sandbox-org/devplat-test-200-1',
              name: 'devplat-test-200-1',
            },
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/interaction-limits',
            { limit: 'collaborators_only' },
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/selected-actions',
            null,
          ],
          [
            'PUT /repos/sandbox-org/devplat-test-200-1/actions/permissions/workflow',
            null,
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1',
            { default_branch: 'main' },
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/git/ref/heads/main',
            { object: { sha: 'sha-main-1' } },
          ],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/git/refs',
            { ref: 'refs/heads/live-test/200-1' },
          ],
          ['POST /repos/sandbox-org/devplat-test-200-1/pulls', { number: 42 }],
          [
            'POST /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/dispatches',
            null,
          ],
          [
            'GET /repos/sandbox-org/devplat-test-200-1/actions/workflows/live-dispatch-canary.yml/runs?branch=live-test%2F200-1&event=workflow_dispatch&per_page=10',
            {
              workflow_runs: [
                {
                  conclusion: 'success',
                  html_url:
                    'https://github.com/sandbox-org/devplat-test-200-1/actions/runs/1',
                  id: 1,
                  status: 'completed',
                },
              ],
            },
          ],
          [
            'PATCH /repos/sandbox-org/devplat-test-200-1/pulls/42',
            { number: 42, state: 'closed' },
          ],
        ]);
        const githubRequest = createTrackedRouteHandler(
          'GitHub',
          githubCalls,
          githubRoutes,
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/README.md',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/README.md',
            },
          },
        );
        githubRoutes.set(
          'PUT /repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
          {
            content: {
              path: '/repos/sandbox-org/devplat-test-200-1/contents/.live-test/200-1/canary.json',
            },
          },
        );

        const discordRequest = async (path, options = {}) => {
          discordCalls.push([path, options.method ?? 'GET']);

          if (path === '/guilds/guild-1' && options.method === undefined) {
            return { id: 'guild-1' };
          }
          if (
            path === '/guilds/guild-1/channels' &&
            options.method === undefined
          ) {
            return sharedDiscordChannels;
          }
          if (
            path.startsWith('/channels/') &&
            path.endsWith('/messages') &&
            options.method === 'POST'
          ) {
            return { id: 'message-1' };
          }

          throw new Error(
            `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
          );
        };

        const sonarRequest = async (path, options = {}) => {
          sonarCalls.push([path, options.method ?? 'GET']);

          if (
            path === '/api/projects/search?organization=sandbox-sonar&ps=1' &&
            options.method === undefined
          ) {
            return { components: [] };
          }
          if (
            path ===
              '/api/projects/search?organization=sandbox-sonar&projects=sandbox-org_devplat-test-200-1' &&
            options.method === undefined
          ) {
            return {
              components: [
                { key: 'sandbox-org_devplat-test-200-1', name: 'fixture' },
              ],
            };
          }

          throw new Error(
            `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
          );
        };

        return {
          discordCalls,
          discordRequest,
          githubCalls,
          githubRequest,
          reportDir,
          registerDiscordApplicationCommandsMock:
            createRegisterDiscordApplicationCommandsMock(),
          runDeepTestMock: async () => {
            throw new Error('deep test failed');
          },
          sonarCalls,
          sonarRequest,
        };
      },
      assert: async (context) => {
        await expect(
          runLiveLab(
            {
              environment: baseEnvironment,
              maxParallelRepos: 6,
              reportDir: context.reportDir,
              retainFailedResources: true,
              skipBuild: true,
            },
            {
              collectFixtureFiles: async () => [
                { path: 'README.md', content: '# Fixture\n' },
              ],
              discordRequest: context.discordRequest,
              githubRequest: context.githubRequest,
              registerDiscordApplicationCommands:
                context.registerDiscordApplicationCommandsMock,
              runDeepTest: context.runDeepTestMock,
              sonarRequest: context.sonarRequest,
            },
          ),
        ).rejects.toThrow('deep test failed');

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDir, 'live-lab-report.json'),
            'utf8',
          ),
        );

        expect(savedReport.status).toBe('failed');
        expect(savedReport.cleanup).toMatchObject({
          repository: { status: 'retained' },
          sonarProject: { status: 'retained' },
        });
        expect(context.discordCalls).toEqual(
          expect.arrayContaining([
            ['/guilds/guild-1/channels', 'GET'],
            ['/channels/project-management-1/messages', 'POST'],
          ]),
        );
        expect(context.githubCalls).not.toContainEqual([
          '/repos/sandbox-org/devplat-test-200-1',
          'DELETE',
        ]);
        expect(context.sonarCalls).not.toContainEqual([
          '/api/projects/delete?project=sandbox-org_devplat-test-200-1',
          'POST',
        ]);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = await testCase.mock();
    await testCase.assert(context, testCase.inputs);
  });
});
