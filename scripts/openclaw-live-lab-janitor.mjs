import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureLiveTestGitHubToken } from './github-app-token.mjs';
import {
  createDiscordRequest,
  listGitHubRepositories,
  createSonarProjectKey,
  discordSnowflakeToTimestamp,
  resolveGitHubOwnerKind,
} from './openclaw-live-lab.mjs';

const livePrefix = 'devplat-test-';
const githubApiVersion = '2026-03-10';
const defaultRepoMaxAgeHours = 24;
const defaultDiscordMaxAgeHours = 7 * 24;
const janitorGitHubAppPermissions = Object.freeze({
  administration: 'write',
  metadata: 'read',
});

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
  const discordMaxAgeHoursValue = args.get('--discord-max-age-hours');
  const repoMaxAgeHours =
    typeof repoMaxAgeHoursValue === 'string'
      ? Number.parseInt(repoMaxAgeHoursValue, 10)
      : defaultRepoMaxAgeHours;
  const discordMaxAgeHours =
    typeof discordMaxAgeHoursValue === 'string'
      ? Number.parseInt(discordMaxAgeHoursValue, 10)
      : defaultDiscordMaxAgeHours;

  if (!Number.isInteger(repoMaxAgeHours) || repoMaxAgeHours < 0) {
    throw new Error('--repo-max-age-hours must be a non-negative integer.');
  }

  if (!Number.isInteger(discordMaxAgeHours) || discordMaxAgeHours < 0) {
    throw new Error('--discord-max-age-hours must be a non-negative integer.');
  }

  return {
    discordMaxAgeHours,
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

export async function loadJanitorEnvironment(
  env = process.env,
  { fetchImpl = fetch } = {},
) {
  await ensureLiveTestGitHubToken({
    env,
    fetchImpl,
    permissions: janitorGitHubAppPermissions,
  });

  return createJanitorEnvironment(env);
}

function planRepositoryCleanup({ maxAgeMs, now, repositories }) {
  const liveRepositories = repositories
    .filter((repository) => repository.name.startsWith(livePrefix))
    .sort((left, right) =>
      String(right.created_at).localeCompare(String(left.created_at)),
    );
  const preservedRepository =
    liveRepositories.find(
      (repository) => now - Date.parse(repository.created_at) < maxAgeMs,
    )?.name ?? null;
  const expiredRepositories = liveRepositories
    .filter((repository) => now - Date.parse(repository.created_at) >= maxAgeMs)
    .sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)),
    );

  return {
    expiredRepositories,
    preservedRepository,
  };
}

export function selectExpiredRepositories({ maxAgeMs, now, repositories }) {
  return planRepositoryCleanup({
    maxAgeMs,
    now,
    repositories,
  }).expiredRepositories;
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
  const resourceLabel = report.dryRun ? 'Would delete' : 'Deleted';
  const repositories = report.dryRun
    ? report.wouldDeleteRepositories.length
    : report.deletedRepositories.length;
  const sonarProjects = report.dryRun
    ? report.wouldDeleteSonarProjects.length
    : report.deletedSonarProjects.length;
  const discordCategories = report.dryRun
    ? report.wouldDeleteDiscordCategories.length
    : report.deletedDiscordCategories.length;

  return [
    '# OpenClaw Live-Lab Janitor',
    '',
    `- Dry run: ${String(report.dryRun)}`,
    `- ${resourceLabel} repositories: ${String(repositories)}`,
    `- ${resourceLabel} Sonar projects: ${String(sonarProjects)}`,
    `- ${resourceLabel} Discord categories: ${String(discordCategories)}`,
    `- Preserved latest repository: ${report.preservedRepository ?? 'n/a'}`,
    `- Cleanup errors: ${String(report.cleanupErrors.length)}`,
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

async function listRepositories({
  githubOrganization,
  githubOwnerKind,
  githubRequest,
}) {
  return listGitHubRepositories({
    githubOwner: githubOrganization,
    githubOwnerKind,
    githubRequest,
  });
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
    cleanupErrors: [],
    deletedDiscordCategories: [],
    deletedRepositories: [],
    deletedSonarProjects: [],
    dryRun: options.dryRun,
    preservedRepository: null,
    wouldDeleteDiscordCategories: [],
    wouldDeleteRepositories: [],
    wouldDeleteSonarProjects: [],
  };

  await makeDirectory(reportDirectory, { recursive: true });

  try {
    const githubOwnerKind = await resolveGitHubOwnerKind({
      githubOwner: options.environment.github.organization,
      githubRequest,
    });
    const repositories = await listRepositories({
      githubOrganization: options.environment.github.organization,
      githubOwnerKind,
      githubRequest,
    });
    const repositoryCleanupPlan = planRepositoryCleanup({
      maxAgeMs: options.repoMaxAgeHours * 60 * 60 * 1_000,
      now,
      repositories,
    });
    report.preservedRepository = repositoryCleanupPlan.preservedRepository;
    const expiredRepositories = repositoryCleanupPlan.expiredRepositories;

    for (const repository of expiredRepositories) {
      const projectKey = createSonarProjectKey(
        options.environment.github.organization,
        repository.name,
      );

      if (options.dryRun) {
        report.wouldDeleteRepositories.push(repository.name);
        report.wouldDeleteSonarProjects.push(projectKey);
        continue;
      }

      await deleteRepository({
        githubOrganization: options.environment.github.organization,
        githubRequest,
        repoName: repository.name,
      });
      report.deletedRepositories.push(repository.name);

      try {
        await deleteSonarProject({
          projectKey,
          sonarRequest,
        });
        report.deletedSonarProjects.push(projectKey);
      } catch (error) {
        report.cleanupErrors.push({
          error: serializeError(error),
          scope: 'sonar-project',
          target: projectKey,
        });
      }
    }

    const channels = await listGuildChannels({
      discordRequest,
      guildId: options.environment.discord.guildId,
    });
    const expiredCategories = selectExpiredDiscordCategories({
      channels,
      maxAgeMs: options.discordMaxAgeHours * 60 * 60 * 1_000,
      now,
    });

    for (const category of expiredCategories) {
      const children = channels.filter(
        (channel) => channel.parent_id === category.id,
      );
      if (options.dryRun) {
        report.wouldDeleteDiscordCategories.push(category.name);
        continue;
      }

      for (const child of children) {
        await deleteDiscordChannel(child.id, discordRequest);
      }

      await deleteDiscordChannel(category.id, discordRequest);
      report.deletedDiscordCategories.push(category.name);
    }

    if (report.cleanupErrors.length > 0) {
      throw new Error(
        `Janitor completed with ${String(report.cleanupErrors.length)} cleanup error(s).`,
      );
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

export async function main(
  argv = process.argv.slice(2),
  {
    createEnvironment = loadJanitorEnvironment,
    runJanitorFn = runJanitor,
    writeOutput = (content) => {
      process.stdout.write(content);
    },
  } = {},
) {
  const args = parseJanitorArgs(argv);
  const environment = await createEnvironment();
  const report = await runJanitorFn({
    ...args,
    environment,
  });

  writeOutput(
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

  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${serializeError(error).message}\n`);
    process.exitCode = 1;
  });
}
