import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectFixtureFiles,
  createDiscordChannelPlan,
  createDiscordRequest,
  createEvictionPlan,
  createLiveLabEnvironment,
  createLiveRuntimeEnv,
  createRunIdentifiers,
  createSonarProjectKey,
  createStatusMessage,
  mapProgressToChannel,
  parseLiveLabArgs,
  runLiveLab,
} from './openclaw-live-lab.mjs';

const temporaryRoots = [];

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

describe('openclaw-live-lab helpers', () => {
  const cases = [
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
          ref: 'main',
          retainFailedResources: true,
          skipBuild: true,
        });
        expect(identifiers).toMatchObject({
          branchName: 'live-test/101-2',
          categoryName: 'devplat-test-101-2',
          repoName: 'devplat-test-101-2',
        });
        expect(channelPlan.map((channel) => channel.name)).toEqual([
          'spec',
          'implementation',
          'pull-request',
          'audit',
          'project-management',
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
        expect(message).toContain('status: in-progress');
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
        const discordChannelResponses = [
          { id: 'category-1', name: 'devplat-test-200-1', type: 4 },
          { id: 'spec-1', name: 'spec', type: 0 },
          { id: 'implementation-1', name: 'implementation', type: 0 },
          { id: 'pull-request-1', name: 'pull-request', type: 0 },
          { id: 'audit-1', name: 'audit', type: 0 },
          { id: 'project-management-1', name: 'project-management', type: 0 },
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
            options.method === 'POST'
          ) {
            return discordChannelResponses.shift();
          }
          if (
            path.startsWith('/channels/') &&
            path.endsWith('/messages') &&
            options.method === 'POST'
          ) {
            discordMessages.push(options.body.content);
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

        return {
          collectFixtureFiles: async () => fixtureFiles,
          discordCalls,
          discordMessages,
          discordRequest,
          githubCalls,
          githubRequest,
          reportDir,
          runDeepTestMock,
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
            runDeepTest: context.runDeepTestMock,
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
            ['/guilds/guild-1/channels', 'POST'],
            ['/channels/spec-1/messages', 'POST'],
            ['/channels/pull-request-1/messages', 'POST'],
          ]),
        );
        expect(context.discordMessages).toEqual(
          expect.arrayContaining([
            expect.stringContaining(`ref: ${inputs.ref}`),
          ]),
        );
        expect(context.summaryEntries[0]).toContain('Status: passed');
        expect(context.summaryEntries[0]).toContain(`Ref: ${inputs.ref}`);
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
        const discordChannelResponses = [
          { id: 'category-1', name: 'devplat-test-200-1', type: 4 },
          { id: 'spec-1', name: 'spec', type: 0 },
          { id: 'implementation-1', name: 'implementation', type: 0 },
          { id: 'pull-request-1', name: 'pull-request', type: 0 },
          { id: 'audit-1', name: 'audit', type: 0 },
          { id: 'project-management-1', name: 'project-management', type: 0 },
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
              options.method === 'POST'
            ) {
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
          githubRequest,
          reportDir,
          runDeepTestMock: async () => ({
            reportDirectory: resolve(reportDir, 'deep-test'),
            steps: [{ tool: 'resolve_runtime_config' }],
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
              runDeepTest: context.runDeepTestMock,
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
        const githubCalls = [];
        const sonarCalls = [];
        const discordChannelResponses = [
          { id: 'category-1', name: 'devplat-test-200-1', type: 4 },
          { id: 'spec-1', name: 'spec', type: 0 },
          { id: 'implementation-1', name: 'implementation', type: 0 },
          { id: 'pull-request-1', name: 'pull-request', type: 0 },
          { id: 'audit-1', name: 'audit', type: 0 },
          { id: 'project-management-1', name: 'project-management', type: 0 },
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
          if (path === '/guilds/guild-1' && options.method === undefined) {
            return { id: 'guild-1' };
          }
          if (
            path === '/guilds/guild-1/channels' &&
            options.method === 'POST'
          ) {
            return discordChannelResponses.shift();
          }
          if (
            path === '/guilds/guild-1/channels' &&
            options.method === undefined
          ) {
            return [
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
          discordRequest,
          githubCalls,
          githubRequest,
          reportDir,
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
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = await testCase.mock();
    await testCase.assert(context, testCase.inputs);
  });
});
