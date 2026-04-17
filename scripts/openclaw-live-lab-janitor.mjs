import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSonarProjectKey,
  discordSnowflakeToTimestamp,
} from './openclaw-live-lab.mjs';

const livePrefix = 'devplat-test-';
const githubApiVersion = '2026-03-10';
const defaultRepoMaxAgeHours = 24;
const defaultDiscordMaxAgeDays = 7;

function parseFlagArguments(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args.set(token, true);
      continue;
    }

    args.set(token, next);
    index += 1;
  }

  return args;
}

function readRequiredEnvironmentValue(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required for the live-lab janitor.`);
  }

  return value;
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? '',
    };
  }

  return {
    message: String(error),
    stack: '',
  };
}

async function requestJson({
  body,
  expectedStatuses = [200],
  fetchImpl = fetch,
  headers = {},
  method = 'GET',
  responseType = 'json',
  url,
}) {
  const requestHeaders = { ...headers };
  let requestBody = body;

  if (
    body !== undefined &&
    body !== null &&
    typeof body === 'object' &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ArrayBuffer) &&
    !Buffer.isBuffer(body)
  ) {
    requestHeaders['content-type'] ??= 'application/json';
    requestBody = JSON.stringify(body);
  }

  const response = await fetchImpl(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });
  const text = await response.text();
  if (!expectedStatuses.includes(response.status)) {
    const detail = text.length > 0 ? `: ${text}` : '.';
    throw new Error(
      `Request to ${url} failed with HTTP ${String(response.status)}${detail}`,
    );
  }

  if (responseType === 'none' || text.length === 0) {
    return null;
  }

  if (responseType === 'text') {
    return text;
  }

  return JSON.parse(text);
}

function createGitHubRequest({ fetchImpl = fetch, token }) {
  return (path, options = {}) =>
    requestJson({
      fetchImpl,
      url: new URL(path, 'https://api.github.com').toString(),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': githubApiVersion,
        ...options.headers,
      },
      ...options,
    });
}

function createDiscordRequest({ baseUrl, botToken, fetchImpl = fetch }) {
  return (path, options = {}) =>
    requestJson({
      fetchImpl,
      url: new URL(path, baseUrl).toString(),
      headers: {
        authorization: `Bot ${botToken}`,
        ...options.headers,
      },
      ...options,
    });
}

function createSonarRequest({ baseUrl, fetchImpl = fetch, token }) {
  const basicToken = Buffer.from(`${token}:`, 'utf8').toString('base64');

  return (path, options = {}) =>
    requestJson({
      fetchImpl,
      url: new URL(path, baseUrl).toString(),
      headers: {
        authorization: `Basic ${basicToken}`,
        ...options.headers,
      },
      ...options,
    });
}

export function parseJanitorArgs(argv) {
  const args = parseFlagArguments(argv);
  const repoMaxAgeHoursValue = args.get('--repo-max-age-hours');
  const discordMaxAgeDaysValue = args.get('--discord-max-age-days');
  const repoMaxAgeHours =
    typeof repoMaxAgeHoursValue === 'string'
      ? Number.parseInt(repoMaxAgeHoursValue, 10)
      : defaultRepoMaxAgeHours;
  const discordMaxAgeDays =
    typeof discordMaxAgeDaysValue === 'string'
      ? Number.parseInt(discordMaxAgeDaysValue, 10)
      : defaultDiscordMaxAgeDays;

  if (!Number.isInteger(repoMaxAgeHours) || repoMaxAgeHours < 1) {
    throw new Error('--repo-max-age-hours must be a positive integer.');
  }

  if (!Number.isInteger(discordMaxAgeDays) || discordMaxAgeDays < 1) {
    throw new Error('--discord-max-age-days must be a positive integer.');
  }

  return {
    discordMaxAgeDays,
    dryRun: args.get('--dry-run') === true,
    repoMaxAgeHours,
    reportDir:
      typeof args.get('--report-dir') === 'string'
        ? resolve(process.cwd(), args.get('--report-dir'))
        : undefined,
  };
}

export function createJanitorEnvironment(env = process.env) {
  return {
    discord: {
      baseUrl:
        env['LIVE_TEST_DISCORD_API_BASE_URL'] ?? 'https://discord.com/api/v10',
      botToken: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_BOT_TOKEN',
      ),
      guildId: readRequiredEnvironmentValue(env, 'LIVE_TEST_DISCORD_GUILD_ID'),
    },
    github: {
      organization: readRequiredEnvironmentValue(env, 'LIVE_TEST_GITHUB_ORG'),
      token: readRequiredEnvironmentValue(env, 'LIVE_TEST_GITHUB_TOKEN'),
    },
    sonar: {
      baseUrl: env['LIVE_TEST_SONAR_BASE_URL'] ?? 'https://sonarcloud.io',
      organization: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_SONAR_ORGANIZATION',
      ),
      token: readRequiredEnvironmentValue(env, 'LIVE_TEST_SONAR_TOKEN'),
    },
    stepSummaryPath: env['GITHUB_STEP_SUMMARY'] ?? null,
  };
}

export function selectExpiredRepositories({ maxAgeMs, now, repositories }) {
  return repositories
    .filter((repository) => repository.name.startsWith(livePrefix))
    .filter((repository) => now - Date.parse(repository.created_at) >= maxAgeMs)
    .sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)),
    );
}

export function selectExpiredDiscordCategories({ channels, maxAgeMs, now }) {
  return channels
    .filter(
      (channel) => channel.type === 4 && channel.name.startsWith(livePrefix),
    )
    .filter(
      (channel) => now - discordSnowflakeToTimestamp(channel.id) >= maxAgeMs,
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function createCleanupSummary(report) {
  return [
    '# OpenClaw Live-Lab Janitor',
    '',
    `- Dry run: ${String(report.dryRun)}`,
    `- Deleted repositories: ${String(report.deletedRepositories.length)}`,
    `- Deleted Sonar projects: ${String(report.deletedSonarProjects.length)}`,
    `- Deleted Discord categories: ${String(report.deletedDiscordCategories.length)}`,
    report.error === undefined ? '' : `- Failure: ${report.error.message}`,
    '',
  ].join('\n');
}

async function appendSummary(summaryPath, content) {
  if (summaryPath === null) {
    return;
  }

  await appendFile(summaryPath, content, 'utf8');
}

async function listRepositories({ githubOrganization, githubRequest }) {
  return githubRequest(
    `/orgs/${encodeURIComponent(githubOrganization)}/repos?type=public&sort=created&direction=asc&per_page=100`,
  );
}

async function deleteRepository({
  githubOrganization,
  githubRequest,
  repoName,
}) {
  await githubRequest(
    `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}`,
    {
      expectedStatuses: [204, 404],
      method: 'DELETE',
      responseType: 'none',
    },
  );
}

async function deleteSonarProject({ projectKey, sonarRequest }) {
  await sonarRequest(
    `/api/projects/delete?project=${encodeURIComponent(projectKey)}`,
    {
      expectedStatuses: [200, 204, 404],
      method: 'POST',
      responseType: 'none',
    },
  );
}

async function listGuildChannels({ discordRequest, guildId }) {
  return discordRequest(`/guilds/${encodeURIComponent(guildId)}/channels`);
}

async function deleteDiscordChannel(channelId, discordRequest) {
  await discordRequest(`/channels/${encodeURIComponent(channelId)}`, {
    expectedStatuses: [200, 204, 404],
    method: 'DELETE',
    responseType: 'none',
  });
}

function createDefaultReportDirectory() {
  return resolve(tmpdir(), `devplat-openclaw-live-lab-janitor-${Date.now()}`);
}

export async function runJanitor(options, dependencies = {}) {
  const appendSummaryFn = dependencies.appendSummary ?? appendSummary;
  const githubRequest =
    dependencies.githubRequest ??
    createGitHubRequest({
      fetchImpl: dependencies.fetchImpl,
      token: options.environment.github.token,
    });
  const discordRequest =
    dependencies.discordRequest ??
    createDiscordRequest({
      baseUrl: options.environment.discord.baseUrl,
      botToken: options.environment.discord.botToken,
      fetchImpl: dependencies.fetchImpl,
    });
  const sonarRequest =
    dependencies.sonarRequest ??
    createSonarRequest({
      baseUrl: options.environment.sonar.baseUrl,
      fetchImpl: dependencies.fetchImpl,
      token: options.environment.sonar.token,
    });
  const makeDirectory = dependencies.makeDirectory ?? mkdir;
  const removeDirectory = dependencies.removeDirectory ?? rm;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;

  const now = options.now ?? Date.now();
  const reportDirectory = options.reportDir ?? createDefaultReportDirectory();
  const report = {
    deletedDiscordCategories: [],
    deletedRepositories: [],
    deletedSonarProjects: [],
    dryRun: options.dryRun,
  };

  await makeDirectory(reportDirectory, { recursive: true });

  try {
    const repositories = await listRepositories({
      githubOrganization: options.environment.github.organization,
      githubRequest,
    });
    const expiredRepositories = selectExpiredRepositories({
      maxAgeMs: options.repoMaxAgeHours * 60 * 60 * 1_000,
      now,
      repositories,
    });

    for (const repository of expiredRepositories) {
      if (!options.dryRun) {
        await deleteRepository({
          githubOrganization: options.environment.github.organization,
          githubRequest,
          repoName: repository.name,
        });
        await deleteSonarProject({
          projectKey: createSonarProjectKey(
            options.environment.github.organization,
            repository.name,
          ),
          sonarRequest,
        }).catch(() => undefined);
      }

      report.deletedRepositories.push(repository.name);
      report.deletedSonarProjects.push(
        createSonarProjectKey(
          options.environment.github.organization,
          repository.name,
        ),
      );
    }

    const channels = await listGuildChannels({
      discordRequest,
      guildId: options.environment.discord.guildId,
    });
    const expiredCategories = selectExpiredDiscordCategories({
      channels,
      maxAgeMs: options.discordMaxAgeDays * 24 * 60 * 60 * 1_000,
      now,
    });

    for (const category of expiredCategories) {
      const children = channels.filter(
        (channel) => channel.parent_id === category.id,
      );
      if (!options.dryRun) {
        for (const child of children) {
          await deleteDiscordChannel(child.id, discordRequest);
        }

        await deleteDiscordChannel(category.id, discordRequest);
      }

      report.deletedDiscordCategories.push(category.name);
    }
  } catch (error) {
    report.error = serializeError(error);
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    report.reportDirectory = reportDirectory;
    await writeTextFile(
      resolve(reportDirectory, 'live-lab-janitor-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await appendSummaryFn(
      options.environment.stepSummaryPath,
      createCleanupSummary(report),
    );

    if (options.cleanupReportDir === true) {
      await removeDirectory(reportDirectory, { force: true, recursive: true });
    }
  }

  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseJanitorArgs(argv);
  const environment = createJanitorEnvironment();
  const report = await runJanitor({
    ...args,
    environment,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        deletedDiscordCategories: report.deletedDiscordCategories.length,
        deletedRepositories: report.deletedRepositories.length,
        deletedSonarProjects: report.deletedSonarProjects.length,
        reportDirectory: report.reportDirectory,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${serializeError(error).message}\n`);
    process.exitCode = 1;
  });
}
