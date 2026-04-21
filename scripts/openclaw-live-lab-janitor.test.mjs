import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createCleanupSummary,
  createJanitorEnvironment,
  loadJanitorEnvironment,
  main as runJanitorCommand,
  parseJanitorArgs,
  runJanitor,
  selectExpiredDiscordCategories,
  selectExpiredRepositories,
} from './openclaw-live-lab-janitor.mjs';

const temporaryRoots = [];
const { privateKey: janitorAppPrivateKey } = generateKeyPairSync('rsa', {
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

function createSnowflakeFromTimestamp(timestampMs) {
  const discordEpoch = 1_420_070_400_000n;
  return String((BigInt(timestampMs) - discordEpoch) << 22n);
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('openclaw-live-lab-janitor helpers', () => {
  const cases = [
    {
      name: 'parses CLI flags and environment',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const parsed = parseJanitorArgs([
          '--repo-max-age-hours',
          '12',
          '--discord-max-age-hours',
          '5',
          '--dry-run',
        ]);
        const environment = createJanitorEnvironment({
          LIVE_TEST_DISCORD_BOT_TOKEN: 'bot-token-1',
          LIVE_TEST_DISCORD_GUILD_ID: 'guild-1',
          LIVE_TEST_GITHUB_ORG: 'sandbox-org',
          LIVE_TEST_GITHUB_TOKEN: 'github-token-1',
          LIVE_TEST_SONAR_ORGANIZATION: 'sandbox-sonar',
          LIVE_TEST_SONAR_TOKEN: 'sonar-token-1',
        });

        expect(parsed).toMatchObject({
          discordMaxAgeHours: 5,
          dryRun: true,
          repoMaxAgeHours: 12,
        });
        expect(environment.github.organization).toBe('sandbox-org');
      },
    },
    {
      name: 'accepts zero-hour janitor windows for immediate cleanup',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        expect(
          parseJanitorArgs([
            '--repo-max-age-hours',
            '0',
            '--discord-max-age-hours',
            '0',
          ]),
        ).toMatchObject({
          discordMaxAgeHours: 0,
          repoMaxAgeHours: 0,
        });
      },
    },
    {
      name: 'selects expired repositories and Discord categories',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const now = Date.parse('2026-04-16T00:00:00.000Z');
        const repositories = selectExpiredRepositories({
          maxAgeMs: 24 * 60 * 60 * 1_000,
          now,
          repositories: [
            {
              created_at: '2026-04-14T00:00:00.000Z',
              name: 'devplat-test-10-1',
            },
            {
              created_at: '2026-04-14T12:00:00.000Z',
              name: 'devplat-test-11-1',
            },
            {
              created_at: '2026-04-10T00:00:00.000Z',
              name: 'other-repo',
            },
          ],
        });
        const categories = selectExpiredDiscordCategories({
          channels: [
            {
              id: createSnowflakeFromTimestamp(
                Date.parse('2026-04-01T00:00:00.000Z'),
              ),
              name: 'devplat-test-10-1',
              type: 4,
            },
            {
              id: createSnowflakeFromTimestamp(
                Date.parse('2026-04-08T00:00:00.000Z'),
              ),
              name: 'devplat-test-11-1',
              type: 4,
            },
          ],
          maxAgeMs: 7 * 24 * 60 * 60 * 1_000,
          now,
        });
        const summary = createCleanupSummary({
          cleanupErrors: [],
          deletedDiscordCategories: ['devplat-test-10-1'],
          deletedRepositories: ['devplat-test-10-1', 'devplat-test-11-1'],
          deletedSonarProjects: [
            'sandbox-org_devplat-test-10-1',
            'sandbox-org_devplat-test-11-1',
          ],
          dryRun: false,
          preservedRepository: null,
          wouldDeleteDiscordCategories: [],
          wouldDeleteRepositories: [],
          wouldDeleteSonarProjects: [],
        });

        expect(repositories.map((repository) => repository.name)).toEqual([
          'devplat-test-10-1',
          'devplat-test-11-1',
        ]);
        expect(categories.map((category) => category.name)).toEqual([
          'devplat-test-10-1',
          'devplat-test-11-1',
        ]);
        expect(summary).toContain('Deleted repositories: 2');
        expect(summary).toContain('Preserved latest repository: n/a');
      },
    },
    {
      name: 'loads the janitor environment by minting a GitHub App token',
      inputs: {},
      mock: async () => {
        const fetchCalls = [];
        const fetchImpl = async (url, options) => {
          fetchCalls.push({
            body:
              typeof options.body === 'string'
                ? JSON.parse(options.body)
                : undefined,
            method: options.method,
            url: String(url),
          });

          if (String(url).endsWith('/orgs/sandbox-org/installation')) {
            return {
              status: 200,
              text: async () => JSON.stringify({ id: 77 }),
            };
          }

          if (String(url).endsWith('/app/installations/77/access_tokens')) {
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
          LIVE_TEST_DISCORD_BOT_TOKEN: 'bot-token-1',
          LIVE_TEST_DISCORD_GUILD_ID: 'guild-1',
          LIVE_TEST_GITHUB_APP_CLIENT_ID: 'client-id-1',
          LIVE_TEST_GITHUB_APP_PRIVATE_KEY: janitorAppPrivateKey,
          LIVE_TEST_GITHUB_ORG: 'sandbox-org',
          LIVE_TEST_SONAR_ORGANIZATION: 'sandbox-sonar',
          LIVE_TEST_SONAR_TOKEN: 'sonar-token-1',
        };

        const environment = await loadJanitorEnvironment(env, {
          fetchImpl: context.fetchImpl,
        });

        expect(environment.github).toMatchObject({
          organization: 'sandbox-org',
          token: 'github-token-2',
        });
        expect(env['LIVE_TEST_GITHUB_TOKEN']).toBe('github-token-2');
        expect(context.fetchCalls).toEqual([
          {
            body: undefined,
            method: 'GET',
            url: 'https://api.github.com/orgs/sandbox-org/installation',
          },
          {
            body: {
              permissions: {
                administration: 'write',
                metadata: 'read',
              },
            },
            method: 'POST',
            url: 'https://api.github.com/app/installations/77/access_tokens',
          },
        ]);
      },
    },
    {
      name: 'runs the janitor CLI entrypoint with injected collaborators',
      inputs: {
        argv: ['--repo-max-age-hours', '12', '--discord-max-age-hours', '5'],
      },
      mock: async () => {
        const writes = [];

        return { writes };
      },
      assert: async (context, inputs) => {
        let capturedOptions = null;
        const reportDirectory = resolve(
          tmpdir(),
          'devplat-live-lab-janitor-report',
        );
        const environment = {
          github: {
            organization: 'sandbox-org',
            token: 'github-token-1',
          },
        };
        const report = await runJanitorCommand(inputs.argv, {
          createEnvironment: async () => environment,
          runJanitorFn: async (options) => {
            capturedOptions = options;

            return {
              deletedDiscordCategories: ['devplat-test-1-1'],
              deletedRepositories: ['devplat-test-1-1'],
              deletedSonarProjects: ['sandbox-org_devplat-test-1-1'],
              reportDirectory,
            };
          },
          writeOutput: (value) => {
            context.writes.push(value);
          },
        });

        expect(capturedOptions).toMatchObject({
          discordMaxAgeHours: 5,
          dryRun: false,
          environment,
          repoMaxAgeHours: 12,
        });
        expect(report.deletedRepositories).toEqual(['devplat-test-1-1']);
        expect(JSON.parse(context.writes[0])).toEqual({
          deletedDiscordCategories: 1,
          deletedRepositories: 1,
          deletedSonarProjects: 1,
          reportDirectory,
        });
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = (await testCase.mock()) ?? {};
    await testCase.assert(context, testCase.inputs);
  });
});

describe('runJanitor', () => {
  const baseEnvironment = {
    discord: {
      baseUrl: 'https://discord.example/api',
      botToken: 'bot-token-1',
      guildId: 'guild-1',
    },
    github: {
      organization: 'sandbox-org',
      token: 'github-token-1',
    },
    sonar: {
      baseUrl: 'https://sonar.example',
      organization: 'sandbox-sonar',
      token: 'sonar-token-1',
    },
    stepSummaryPath: null,
  };

  const cases = [
    {
      name: 'deletes expired resources and writes a report',
      inputs: {
        dryRun: false,
      },
      mock: async () => {
        const reportDir = await mkdtemp(resolve(tmpdir(), 'devplat-janitor-'));
        temporaryRoots.push(reportDir);
        const githubCalls = [];
        const discordCalls = [];
        const sonarCalls = [];

        return {
          discordCalls,
          discordRequest: async (path, options = {}) => {
            discordCalls.push([path, options.method ?? 'GET']);

            if (
              path === '/guilds/guild-1/channels' &&
              options.method === undefined
            ) {
              return [
                {
                  id: createSnowflakeFromTimestamp(
                    Date.parse('2026-04-01T00:00:00.000Z'),
                  ),
                  name: 'devplat-test-100-1',
                  type: 4,
                },
                {
                  id: createSnowflakeFromTimestamp(
                    Date.parse('2026-04-12T00:00:00.000Z'),
                  ),
                  name: 'devplat-test-101-1',
                  type: 4,
                },
                {
                  id: 'spec-channel',
                  name: 'spec',
                  parent_id: createSnowflakeFromTimestamp(
                    Date.parse('2026-04-01T00:00:00.000Z'),
                  ),
                  type: 0,
                },
              ];
            }
            if (path.startsWith('/channels/') && options.method === 'DELETE') {
              return null;
            }

            throw new Error(
              `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          githubCalls,
          githubRequest: async (path, options = {}) => {
            githubCalls.push([path, options.method ?? 'GET']);

            if (path === '/orgs/sandbox-org' && options.method === undefined) {
              return { login: 'sandbox-org' };
            }
            if (
              path ===
                '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100' &&
              options.method === undefined
            ) {
              return [
                {
                  created_at: '2026-04-10T00:00:00.000Z',
                  name: 'devplat-test-100-1',
                },
                {
                  created_at: '2026-04-15T23:30:00.000Z',
                  name: 'devplat-test-101-1',
                },
              ];
            }
            if (
              path === '/repos/sandbox-org/devplat-test-100-1' &&
              options.method === 'DELETE'
            ) {
              return null;
            }

            throw new Error(
              `Unexpected GitHub request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          reportDir,
          sonarCalls,
          sonarRequest: async (path, options = {}) => {
            sonarCalls.push([path, options.method ?? 'GET']);

            if (
              path ===
                '/api/projects/delete?project=sandbox-org_devplat-test-100-1' &&
              options.method === 'POST'
            ) {
              return null;
            }

            throw new Error(
              `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
            );
          },
        };
      },
      assert: async (context, inputs) => {
        const report = await runJanitor(
          {
            discordMaxAgeHours: 7 * 24,
            dryRun: inputs.dryRun,
            environment: baseEnvironment,
            now: Date.parse('2026-04-16T00:00:00.000Z'),
            repoMaxAgeHours: 24,
            reportDir: context.reportDir,
          },
          {
            discordRequest: context.discordRequest,
            githubRequest: context.githubRequest,
            sonarRequest: context.sonarRequest,
          },
        );

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDir, 'live-lab-janitor-report.json'),
            'utf8',
          ),
        );

        expect(report.deletedRepositories).toEqual(['devplat-test-100-1']);
        expect(report.deletedDiscordCategories).toEqual(['devplat-test-100-1']);
        expect(report.preservedRepository).toBe('devplat-test-101-1');
        expect(savedReport.deletedSonarProjects).toEqual([
          'sandbox-org_devplat-test-100-1',
        ]);
        expect(savedReport.cleanupErrors).toEqual([]);
        expect(context.githubCalls).toEqual(
          expect.arrayContaining([
            ['/repos/sandbox-org/devplat-test-100-1', 'DELETE'],
          ]),
        );
        expect(context.discordCalls).toEqual(
          expect.arrayContaining([['/channels/spec-channel', 'DELETE']]),
        );
        expect(context.sonarCalls).toEqual(
          expect.arrayContaining([
            [
              '/api/projects/delete?project=sandbox-org_devplat-test-100-1',
              'POST',
            ],
          ]),
        );
      },
    },
    {
      name: 'reports expired resources without deleting them in dry-run mode',
      inputs: {
        dryRun: true,
      },
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-janitor-dry-run-'),
        );
        temporaryRoots.push(reportDir);
        const githubCalls = [];
        const discordCalls = [];
        const sonarCalls = [];
        const categoryId = createSnowflakeFromTimestamp(
          Date.parse('2026-04-01T00:00:00.000Z'),
        );
        const newestCategoryId = createSnowflakeFromTimestamp(
          Date.parse('2026-04-12T00:00:00.000Z'),
        );

        return {
          discordCalls,
          discordRequest: async (path, options = {}) => {
            discordCalls.push([path, options.method ?? 'GET']);

            if (
              path === '/guilds/guild-1/channels' &&
              options.method === undefined
            ) {
              return [
                { id: categoryId, name: 'devplat-test-100-1', type: 4 },
                {
                  id: newestCategoryId,
                  name: 'devplat-test-101-1',
                  type: 4,
                },
              ];
            }

            throw new Error(
              `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          githubCalls,
          githubRequest: async (path, options = {}) => {
            githubCalls.push([path, options.method ?? 'GET']);

            if (path === '/orgs/sandbox-org' && options.method === undefined) {
              return { login: 'sandbox-org' };
            }
            if (
              path ===
                '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100' &&
              options.method === undefined
            ) {
              return [
                {
                  created_at: '2026-04-10T00:00:00.000Z',
                  name: 'devplat-test-100-1',
                },
                {
                  created_at: '2026-04-15T12:00:00.000Z',
                  name: 'devplat-test-101-1',
                },
              ];
            }

            throw new Error(
              `Unexpected GitHub request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          reportDir,
          sonarCalls,
          sonarRequest: async (path, options = {}) => {
            sonarCalls.push([path, options.method ?? 'GET']);
            throw new Error(
              `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
            );
          },
        };
      },
      assert: async (context, inputs) => {
        const report = await runJanitor(
          {
            discordMaxAgeHours: 7 * 24,
            dryRun: inputs.dryRun,
            environment: baseEnvironment,
            now: Date.parse('2026-04-16T00:00:00.000Z'),
            repoMaxAgeHours: 24,
            reportDir: context.reportDir,
          },
          {
            discordRequest: context.discordRequest,
            githubRequest: context.githubRequest,
            sonarRequest: context.sonarRequest,
          },
        );

        expect(report.deletedRepositories).toEqual([]);
        expect(report.deletedDiscordCategories).toEqual([]);
        expect(report.preservedRepository).toBe('devplat-test-101-1');
        expect(report.wouldDeleteRepositories).toEqual(['devplat-test-100-1']);
        expect(report.wouldDeleteDiscordCategories).toEqual([
          'devplat-test-100-1',
        ]);
        expect(context.githubCalls).toEqual([
          ['/orgs/sandbox-org', 'GET'],
          [
            '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100',
            'GET',
          ],
        ]);
        expect(context.discordCalls).toEqual([
          ['/guilds/guild-1/channels', 'GET'],
        ]);
        expect(context.sonarCalls).toEqual([]);
      },
    },
    {
      name: 'cleans up stale repositories even when they are the newest live repo',
      inputs: {},
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-janitor-preserve-latest-'),
        );
        temporaryRoots.push(reportDir);

        return {
          discordRequest: async (path, options = {}) => {
            if (
              path === '/guilds/guild-1/channels' &&
              options.method === undefined
            ) {
              return [
                {
                  id: createSnowflakeFromTimestamp(
                    Date.parse('2026-04-01T00:00:00.000Z'),
                  ),
                  name: 'devplat-test-101-1',
                  type: 4,
                },
              ];
            }
            if (
              path ===
                `/channels/${encodeURIComponent(
                  createSnowflakeFromTimestamp(
                    Date.parse('2026-04-01T00:00:00.000Z'),
                  ),
                )}` &&
              options.method === 'DELETE'
            ) {
              return null;
            }

            throw new Error(
              `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          githubRequest: async (path, options = {}) => {
            if (path === '/orgs/sandbox-org' && options.method === undefined) {
              return { login: 'sandbox-org' };
            }
            if (
              path ===
                '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100' &&
              options.method === undefined
            ) {
              return [
                {
                  created_at: '2026-04-01T00:00:00.000Z',
                  name: 'devplat-test-101-1',
                },
              ];
            }
            if (
              path === '/repos/sandbox-org/devplat-test-101-1' &&
              options.method === 'DELETE'
            ) {
              return null;
            }

            throw new Error(
              `Unexpected GitHub request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          reportDir,
          sonarRequest: async (path, options = {}) => {
            if (
              path ===
                '/api/projects/delete?project=sandbox-org_devplat-test-101-1' &&
              options.method === 'POST'
            ) {
              return null;
            }

            throw new Error(
              `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
            );
          },
        };
      },
      assert: async (context) => {
        const report = await runJanitor(
          {
            discordMaxAgeHours: 7 * 24,
            dryRun: false,
            environment: baseEnvironment,
            now: Date.parse('2026-04-16T00:00:00.000Z'),
            repoMaxAgeHours: 24,
            reportDir: context.reportDir,
          },
          {
            discordRequest: context.discordRequest,
            githubRequest: context.githubRequest,
            sonarRequest: context.sonarRequest,
          },
        );

        expect(report.deletedRepositories).toEqual(['devplat-test-101-1']);
        expect(report.deletedDiscordCategories).toEqual(['devplat-test-101-1']);
        expect(report.deletedSonarProjects).toEqual([
          'sandbox-org_devplat-test-101-1',
        ]);
        expect(report.preservedRepository).toBeNull();
      },
    },
    {
      name: 'surfaces Sonar cleanup failures without claiming deletion',
      inputs: {},
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-janitor-sonar-failure-'),
        );
        temporaryRoots.push(reportDir);

        return {
          discordRequest: async (path, options = {}) => {
            if (
              path === '/guilds/guild-1/channels' &&
              options.method === undefined
            ) {
              return [];
            }

            throw new Error(
              `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          githubRequest: async (path, options = {}) => {
            if (path === '/orgs/sandbox-org' && options.method === undefined) {
              return { login: 'sandbox-org' };
            }
            if (
              path ===
                '/orgs/sandbox-org/repos?type=public&sort=created&direction=asc&per_page=100' &&
              options.method === undefined
            ) {
              return [
                {
                  created_at: '2026-04-10T00:00:00.000Z',
                  name: 'devplat-test-100-1',
                },
                {
                  created_at: '2026-04-15T12:00:00.000Z',
                  name: 'devplat-test-101-1',
                },
              ];
            }
            if (
              path === '/repos/sandbox-org/devplat-test-100-1' &&
              options.method === 'DELETE'
            ) {
              return null;
            }

            throw new Error(
              `Unexpected GitHub request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          reportDir,
          sonarRequest: async (path, options = {}) => {
            if (
              path ===
                '/api/projects/delete?project=sandbox-org_devplat-test-100-1' &&
              options.method === 'POST'
            ) {
              throw new Error('sonar cleanup failed');
            }

            throw new Error(
              `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
            );
          },
        };
      },
      assert: async (context) => {
        await expect(
          runJanitor(
            {
              discordMaxAgeHours: 7 * 24,
              dryRun: false,
              environment: baseEnvironment,
              now: Date.parse('2026-04-16T00:00:00.000Z'),
              repoMaxAgeHours: 24,
              reportDir: context.reportDir,
            },
            {
              discordRequest: context.discordRequest,
              githubRequest: context.githubRequest,
              sonarRequest: context.sonarRequest,
            },
          ),
        ).rejects.toThrow('cleanup error');

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDir, 'live-lab-janitor-report.json'),
            'utf8',
          ),
        );

        expect(savedReport.deletedRepositories).toEqual(['devplat-test-100-1']);
        expect(savedReport.deletedSonarProjects).toEqual([]);
        expect(savedReport.cleanupErrors).toEqual([
          expect.objectContaining({
            scope: 'sonar-project',
            target: 'sandbox-org_devplat-test-100-1',
          }),
        ]);
      },
    },
    {
      name: 'uses user repository endpoints when the GitHub owner is a user account',
      inputs: {},
      mock: async () => {
        const reportDir = await mkdtemp(
          resolve(tmpdir(), 'devplat-janitor-user-owner-'),
        );
        temporaryRoots.push(reportDir);
        const githubCalls = [];

        return {
          githubCalls,
          discordRequest: async (path, options = {}) => {
            if (
              path === '/guilds/guild-1/channels' &&
              options.method === undefined
            ) {
              return [];
            }

            throw new Error(
              `Unexpected Discord request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          githubRequest: async (path, options = {}) => {
            githubCalls.push([path, options.method ?? 'GET']);

            if (path === '/orgs/sandbox-user' && options.method === undefined) {
              throw new Error(
                'Request to https://api.github.com/orgs/sandbox-user failed with HTTP 404: {"message":"Not Found"}',
              );
            }
            if (
              path === '/users/sandbox-user' &&
              options.method === undefined
            ) {
              return { login: 'sandbox-user', type: 'User' };
            }
            if (
              path ===
                '/users/sandbox-user/repos?type=owner&sort=created&direction=asc&per_page=100' &&
              options.method === undefined
            ) {
              return [
                {
                  created_at: '2026-04-10T00:00:00.000Z',
                  name: 'devplat-test-100-1',
                },
                {
                  created_at: '2026-04-15T12:00:00.000Z',
                  name: 'devplat-test-101-1',
                },
              ];
            }

            throw new Error(
              `Unexpected GitHub request: ${path} ${options.method ?? 'GET'}`,
            );
          },
          reportDir,
          sonarRequest: async (path, options = {}) => {
            throw new Error(
              `Unexpected Sonar request: ${path} ${options.method ?? 'GET'}`,
            );
          },
        };
      },
      assert: async (context) => {
        const report = await runJanitor(
          {
            discordMaxAgeHours: 7 * 24,
            dryRun: true,
            environment: {
              ...baseEnvironment,
              github: {
                organization: 'sandbox-user',
                token: 'github-token-1',
              },
            },
            now: Date.parse('2026-04-16T00:00:00.000Z'),
            repoMaxAgeHours: 24,
            reportDir: context.reportDir,
          },
          {
            discordRequest: context.discordRequest,
            githubRequest: context.githubRequest,
            sonarRequest: context.sonarRequest,
          },
        );

        expect(report.wouldDeleteRepositories).toEqual(['devplat-test-100-1']);
        expect(report.preservedRepository).toBe('devplat-test-101-1');
        expect(context.githubCalls).toEqual([
          ['/orgs/sandbox-user', 'GET'],
          ['/users/sandbox-user', 'GET'],
          [
            '/users/sandbox-user/repos?type=owner&sort=created&direction=asc&per_page=100',
            'GET',
          ],
        ]);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = await testCase.mock();
    await testCase.assert(context, testCase.inputs);
  });
});
