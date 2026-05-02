import { randomUUID } from 'node:crypto';
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createGitHubAppJwt,
  ensureLiveTestGitHubToken,
} from './github-app-token.mjs';
import { createRuntimeEnv, runDeepTest } from './openclaw-deep-test.mjs';

const repoRootDirectory = resolve(import.meta.dirname, '..');
const fixtureRootDirectory = resolve(
  repoRootDirectory,
  'scripts/fixtures/openclaw-live-lab-repo',
);
const githubApiVersion = '2026-03-10';
const defaultMaxParallelRepos = 6;
const defaultReportPrefix = 'devplat-openclaw-live-lab';
const defaultWorkflowFileName = 'live-dispatch-canary.yml';
const defaultSonarProjectTimeoutMs = 180_000;
const defaultWorkflowTimeoutMs = 180_000;
const defaultPollMs = 5_000;
/**
 * Default window that keeps the private runtime online after operator controls are posted.
 */
const defaultOperatorHoldMs = 150_000;
const githubRepositoryListPageSize = 100;
const livePrefix = 'devplat-test-';
/**
 * Discord message flag that suppresses URL embeds on status posts.
 */
const discordSuppressEmbedsMessageFlag = 4;
/**
 * Characters outside Sonar's stable project-key vocabulary are normalized.
 */
const sonarProjectKeyUnsafeCharacterPattern = /[^a-zA-Z0-9_.:-]+/gu;
/**
 * Shared Discord category used by live-lab and OpenClaw test runs.
 */
const testDiscordCategoryName = 'test';
/**
 * Discord component wire field for the developer-defined interaction id.
 */
const discordComponentCustomIdField = 'custom_id';
const liveLabGitHubAppPermissions = Object.freeze({
  actions: 'write',
  administration: 'write',
  checks: 'read',
  contents: 'write',
  issues: 'write',
  metadata: 'read',
  pull_requests: 'write',
  workflows: 'write',
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
    throw new Error(`${name} is required for the live lab.`);
  }

  return value;
}

function sanitizeSegment(value) {
  let normalized = '';
  let needsSeparator = false;

  for (const character of value) {
    const code = character.codePointAt(0);
    const isAsciiLetter =
      code !== undefined &&
      ((code >= 65 && code <= 90) || (code >= 97 && code <= 122));
    const isDigit = code !== undefined && code >= 48 && code <= 57;
    const isLiteral =
      character === '_' || character === '.' || character === '-';

    if (isAsciiLetter || isDigit || isLiteral) {
      normalized += character;
      needsSeparator = false;
      continue;
    }

    if (!needsSeparator && normalized.length > 0) {
      normalized += '-';
      needsSeparator = true;
    }
  }

  while (normalized.startsWith('-')) {
    normalized = normalized.slice(1);
  }

  while (normalized.endsWith('-')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function encodeRepositoryPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function encodeBranchName(branchName) {
  return encodeURIComponent(branchName);
}

function resolveWorkflowUrl({ repository, runId, serverUrl }) {
  if (
    typeof repository !== 'string' ||
    typeof runId !== 'string' ||
    typeof serverUrl !== 'string'
  ) {
    return null;
  }

  return `${serverUrl}/${repository}/actions/runs/${runId}`;
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

function createRequestError(message, status, responseText) {
  const statusFragment = status === null ? '' : ` (HTTP ${String(status)})`;
  const responseFragment = responseText.length > 0 ? `: ${responseText}` : '.';
  const error = new Error(`${message}${statusFragment}${responseFragment}`);
  error.status = status;
  error.responseText = responseText;
  return error;
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
    throw createRequestError(`Request to ${url} failed`, response.status, text);
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

function resolveApiRequestUrl(path, baseUrl) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBaseUrl).toString();
}

export function createDiscordRequest({ baseUrl, botToken, fetchImpl = fetch }) {
  return (path, options = {}) =>
    requestJson({
      fetchImpl,
      url: resolveApiRequestUrl(path, baseUrl),
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

export function parseLiveLabArgs(argv) {
  const args = parseFlagArguments(argv);
  const maxParallelReposValue = args.get('--max-parallel-repos');
  const maxParallelRepos =
    typeof maxParallelReposValue === 'string'
      ? Number.parseInt(maxParallelReposValue, 10)
      : undefined;
  if (
    maxParallelReposValue !== undefined &&
    (!Number.isInteger(maxParallelRepos) || maxParallelRepos < 1)
  ) {
    throw new Error('--max-parallel-repos must be a positive integer.');
  }
  const operatorHoldMsValue = args.get('--operator-hold-ms');
  const operatorHoldMs =
    typeof operatorHoldMsValue === 'string'
      ? Number.parseInt(operatorHoldMsValue, 10)
      : defaultOperatorHoldMs;
  if (
    operatorHoldMsValue !== undefined &&
    (!Number.isInteger(operatorHoldMs) || operatorHoldMs < 0)
  ) {
    throw new Error('--operator-hold-ms must be a non-negative integer.');
  }

  const image = args.get('--image');
  const skipBuild = args.get('--skip-build') === true;
  if (skipBuild && typeof image !== 'string') {
    throw new Error('--skip-build requires --image.');
  }

  return {
    image: typeof image === 'string' ? image : undefined,
    maxParallelRepos,
    operatorHoldMs,
    ref: typeof args.get('--ref') === 'string' ? args.get('--ref') : undefined,
    reportDir:
      typeof args.get('--report-dir') === 'string'
        ? resolve(repoRootDirectory, args.get('--report-dir'))
        : undefined,
    retainContainerOnFailure:
      args.get('--retain-container-on-failure') === true,
    retainFailedResources: args.get('--retain-failed-resources') === true,
    skipBuild,
  };
}

export function createRunIdentifiers({ runAttempt, runNumber }) {
  const normalizedRunNumber = String(runNumber);
  const normalizedRunAttempt = String(runAttempt);
  const runLabel = `${normalizedRunNumber}-${normalizedRunAttempt}`;
  const repoName = `${livePrefix}${runLabel}`;

  return {
    branchName: `live-test/${runLabel}`,
    categoryName: testDiscordCategoryName,
    repoName,
    runAttempt: normalizedRunAttempt,
    runLabel,
    runNumber: normalizedRunNumber,
  };
}

export function createDiscordChannelPlan(
  categoryName = testDiscordCategoryName,
) {
  return [
    { categoryName, key: 'spec', name: 'spec' },
    {
      categoryName,
      key: 'implementation',
      name: 'implementation',
    },
    {
      categoryName,
      key: 'pullRequest',
      name: 'pull-request',
    },
    { categoryName, key: 'audit', name: 'audit' },
    {
      categoryName,
      key: 'projectManagement',
      name: 'project-management',
    },
  ];
}

/**
 * Resolves the canonical status indicator for live-lab operator messages.
 */
function resolveLiveLabStatusIndicator(status) {
  switch (status) {
    case 'failed':
      return '🔴';
    case 'passed':
      return '🟢';
    default:
      return '🟡';
  }
}

export function createStatusMessage({
  details,
  phase,
  ref,
  repoFullName,
  runLabel,
  sha,
  status,
  workflowUrl,
}) {
  const title = `${resolveLiveLabStatusIndicator(status)} DevPlat · Live lab ${phase}`;
  const lines = [
    title,
    '',
    `Status: ${status}`,
    `Scope: live-lab · ${runLabel}`,
    `Item: ${repoFullName}`,
    'Actor: workflow',
    `Sha: ${sha}`,
    `→ ${details ?? 'Progress update.'}`,
    '',
    `Ref: ${ref}`,
  ];

  if (workflowUrl !== null) {
    lines.push(`Workflow: <${workflowUrl}>`);
  }

  return {
    allowed_mentions: { parse: [] },
    content: lines.join('\n'),
    flags: discordSuppressEmbedsMessageFlag,
  };
}

export function mapProgressToChannel(progress) {
  const pullRequestTools = new Set([
    'create_pull_request_record',
    'submit_pull_request_update',
    'submit_pull_request_merge',
    'plan_rebase_dependents',
    'execute_rebase_dependents',
    'create_github_action_request',
    'submit_github_action',
  ]);

  if (progress.phase === 'planning') {
    return 'spec';
  }

  if (progress.phase === 'config' || progress.phase === 'contracts') {
    return 'audit';
  }

  if (progress.phase === 'build' || progress.phase === 'container') {
    return 'projectManagement';
  }

  if (
    progress.phase === 'delivery' &&
    typeof progress.step === 'string' &&
    pullRequestTools.has(progress.step)
  ) {
    return 'pullRequest';
  }

  return 'implementation';
}

export function createEvictionPlan(repositories, maxParallelRepos) {
  const liveRepositories = repositories
    .filter((repository) => repository.name.startsWith(livePrefix))
    .sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)),
    );

  if (liveRepositories.length < maxParallelRepos) {
    return null;
  }

  return {
    candidate: liveRepositories[0],
    liveRepositories,
  };
}

export function createSonarProjectKey(githubOrganization, repoName) {
  return `${githubOrganization}_${repoName}`.replace(
    sonarProjectKeyUnsafeCharacterPattern,
    '_',
  );
}

export function createLiveRuntimeEnv({
  discordChannels,
  discordConfig,
  githubOrganization,
  repoName,
  sonarOrganization,
}) {
  return createRuntimeEnv({
    DISCORD_APPLICATION_ID: discordConfig.applicationId,
    DISCORD_AUDIT_CHANNEL_ID: discordChannels.audit.id,
    DISCORD_BOT_TOKEN: discordConfig.botToken,
    DISCORD_CATEGORY_NAME:
      discordConfig.categoryName ?? testDiscordCategoryName,
    DISCORD_DEFAULT_GUILD_ID: discordConfig.guildId,
    DISCORD_IMPLEMENTATION_CHANNEL_ID: discordChannels.implementation.id,
    DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID: discordChannels.projectManagement.id,
    DISCORD_PUBLIC_KEY: discordConfig.publicKey,
    DISCORD_PULL_REQUEST_CHANNEL_ID: discordChannels.pullRequest.id,
    DISCORD_SPEC_CHANNEL_ID: discordChannels.spec.id,
    GITHUB_OWNER: githubOrganization,
    GITHUB_REPO: repoName,
    SONAR_ORGANIZATION: sonarOrganization,
    SONAR_PROJECT_KEY: createSonarProjectKey(githubOrganization, repoName),
  });
}

export async function collectFixtureFiles(
  rootDirectory = fixtureRootDirectory,
) {
  const queue = [rootDirectory];
  const entries = [];

  while (queue.length > 0) {
    const currentDirectory = queue.shift();
    const directoryEntries = await readdir(currentDirectory, {
      withFileTypes: true,
    });
    directoryEntries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of directoryEntries) {
      const entryPath = resolve(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      const relativePath = entryPath
        .slice(rootDirectory.length + 1)
        .replaceAll('\\', '/');
      entries.push({
        content: await readFile(entryPath, 'utf8'),
        path: relativePath,
      });
    }
  }

  return entries.sort((left, right) => {
    if (left.path === 'README.md') {
      return -1;
    }
    if (right.path === 'README.md') {
      return 1;
    }

    return left.path.localeCompare(right.path);
  });
}

export function createStepSummary(report) {
  const lines = [
    '# OpenClaw Live Lab',
    '',
    `- Status: ${report.status}`,
    `- Ref: ${report.ref ?? 'n/a'}`,
    `- Run: ${report.runLabel}`,
    `- Repository: ${report.github?.repoFullName ?? 'n/a'}`,
    `- Workflow: ${report.workflowUrl ?? 'n/a'}`,
    `- Discord category: ${report.discord?.category?.name ?? 'n/a'}`,
    `- Discord channels: ${report.discord?.channelNames?.join(', ') ?? 'n/a'}`,
    `- Deep-test steps: ${String(report.deepTest?.steps ?? 0)}`,
    `- Repository cleanup: ${report.cleanup?.repository.status ?? 'n/a'}`,
    `- Sonar cleanup: ${report.cleanup?.sonarProject.status ?? 'n/a'}`,
  ];

  if (report.evictedRepository !== undefined) {
    lines.push(`- Evicted repository: ${report.evictedRepository}`);
  }

  if (report.error !== undefined) {
    lines.push(`- Failure: ${report.error.message}`);
  }

  return `${lines.join('\n')}\n`;
}

export function createLiveLabEnvironment(env = process.env) {
  const runNumber = env['GITHUB_RUN_NUMBER'] ?? 'local';
  const runAttempt = env['GITHUB_RUN_ATTEMPT'] ?? '1';

  return {
    discord: {
      applicationId: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_APPLICATION_ID',
      ),
      baseUrl:
        env['LIVE_TEST_DISCORD_API_BASE_URL'] ?? 'https://discord.com/api/v10',
      botToken: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_BOT_TOKEN',
      ),
      guildId: readRequiredEnvironmentValue(env, 'LIVE_TEST_DISCORD_GUILD_ID'),
      publicKey: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_PUBLIC_KEY',
      ),
    },
    github: {
      organization: readRequiredEnvironmentValue(env, 'LIVE_TEST_GITHUB_ORG'),
      token: readRequiredEnvironmentValue(env, 'LIVE_TEST_GITHUB_TOKEN'),
    },
    githubWorkflow: {
      ref: env['GITHUB_REF_NAME'] ?? 'local',
      repository: env['GITHUB_REPOSITORY'] ?? 'VannaDii/devplat',
      runId: env['GITHUB_RUN_ID'] ?? null,
      runNumber,
      runAttempt,
      serverUrl: env['GITHUB_SERVER_URL'] ?? 'https://github.com',
      sha: env['GITHUB_SHA'] ?? 'local',
      stepSummaryPath: env['GITHUB_STEP_SUMMARY'] ?? null,
    },
    sonar: {
      baseUrl: env['LIVE_TEST_SONAR_BASE_URL'] ?? 'https://sonarcloud.io',
      organization: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_SONAR_ORGANIZATION',
      ),
      token: readRequiredEnvironmentValue(env, 'LIVE_TEST_SONAR_TOKEN'),
    },
  };
}

async function resolveGitHubOwnerKindWithAppCredentials({
  clientId,
  fetchImpl = fetch,
  githubOwner,
  privateKey,
}) {
  const jwt = createGitHubAppJwt({
    clientId,
    privateKey,
  });
  const owner = await requestJson({
    fetchImpl,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${jwt}`,
      'x-github-api-version': githubApiVersion,
    },
    url: new URL(
      `/users/${encodeURIComponent(githubOwner)}`,
      'https://api.github.com',
    ).toString(),
  });

  if (owner?.type === 'User') {
    return 'user';
  }
  if (owner?.type === 'Organization') {
    return 'organization';
  }

  throw new Error(
    `GitHub owner ${githubOwner} must resolve to a User or Organization account.`,
  );
}

export async function loadLiveLabEnvironment(
  env = process.env,
  { fetchImpl = fetch } = {},
) {
  const existingToken = env['LIVE_TEST_GITHUB_TOKEN'];
  if (
    (typeof existingToken !== 'string' || existingToken.length === 0) &&
    (await resolveGitHubOwnerKindWithAppCredentials({
      clientId: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_GITHUB_APP_CLIENT_ID',
      ),
      fetchImpl,
      githubOwner: readRequiredEnvironmentValue(env, 'LIVE_TEST_GITHUB_ORG'),
      privateKey: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_GITHUB_APP_PRIVATE_KEY',
      ),
    })) === 'user'
  ) {
    throw new Error(
      'LIVE_TEST_GITHUB_TOKEN is required when LIVE_TEST_GITHUB_ORG points to a user account.',
    );
  }

  await ensureLiveTestGitHubToken({
    env,
    fetchImpl,
    permissions: liveLabGitHubAppPermissions,
  });

  return createLiveLabEnvironment(env);
}

export function discordSnowflakeToTimestamp(snowflake) {
  const discordEpoch = 1_420_070_400_000n;
  const createdAt = (BigInt(String(snowflake)) >> 22n) + discordEpoch;
  return Number(createdAt);
}

async function sleep(delayMs) {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, delayMs);
  });
}

async function appendSummary(summaryPath, content) {
  if (summaryPath === null) {
    return;
  }

  await appendFile(summaryPath, content, 'utf8');
}

function isGitHubNotFoundError(error) {
  return (
    error instanceof Error &&
    ((typeof error.status === 'number' && error.status === 404) ||
      error.message.includes('(HTTP 404)') ||
      error.message.includes(' failed with HTTP 404'))
  );
}

export async function resolveGitHubOwnerKind({ githubOwner, githubRequest }) {
  try {
    await githubRequest(`/orgs/${encodeURIComponent(githubOwner)}`);
    return 'organization';
  } catch (error) {
    if (!isGitHubNotFoundError(error)) {
      throw error;
    }
  }

  const owner = await githubRequest(
    `/users/${encodeURIComponent(githubOwner)}`,
  );
  if (owner?.type === 'User') {
    return 'user';
  }
  if (owner?.type === 'Organization') {
    return 'organization';
  }

  throw new Error(
    `GitHub owner ${githubOwner} must resolve to a User or Organization account.`,
  );
}

export function createGitHubRepositoryListPath({
  githubOwner,
  githubOwnerKind,
  page = 1,
}) {
  if (githubOwnerKind === 'organization') {
    const searchParams = new URLSearchParams({
      type: 'public',
      sort: 'created',
      direction: 'asc',
      per_page: String(githubRepositoryListPageSize),
    });
    if (page > 1) {
      searchParams.set('page', String(page));
    }
    return `/orgs/${encodeURIComponent(githubOwner)}/repos?${searchParams.toString()}`;
  }
  if (githubOwnerKind === 'user') {
    const searchParams = new URLSearchParams({
      type: 'owner',
      sort: 'created',
      direction: 'asc',
      per_page: String(githubRepositoryListPageSize),
    });
    if (page > 1) {
      searchParams.set('page', String(page));
    }
    return `/users/${encodeURIComponent(githubOwner)}/repos?${searchParams.toString()}`;
  }

  throw new Error(`Unsupported GitHub owner kind: ${githubOwnerKind}`);
}

export async function listGitHubRepositories({
  githubOwner,
  githubOwnerKind,
  githubRequest,
}) {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const pageRepositories = await githubRequest(
      createGitHubRepositoryListPath({
        githubOwner,
        githubOwnerKind,
        page,
      }),
    );
    repositories.push(...pageRepositories);

    if (pageRepositories.length < githubRepositoryListPageSize) {
      return repositories;
    }
  }
}

export function createGitHubRepositoryCreatePath({
  githubOwner,
  githubOwnerKind,
}) {
  if (githubOwnerKind === 'organization') {
    return `/orgs/${encodeURIComponent(githubOwner)}/repos`;
  }
  if (githubOwnerKind === 'user') {
    return '/user/repos';
  }

  throw new Error(`Unsupported GitHub owner kind: ${githubOwnerKind}`);
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

async function createRepository({
  githubOrganization,
  githubOwnerKind,
  githubRequest,
  repoName,
}) {
  return githubRequest(
    createGitHubRepositoryCreatePath({
      githubOwner: githubOrganization,
      githubOwnerKind,
    }),
    {
      body: {
        allow_auto_merge: false,
        auto_init: false,
        delete_branch_on_merge: true,
        description: 'Ephemeral DevPlat live-lab fixture repository.',
        has_discussions: false,
        has_issues: false,
        has_projects: false,
        has_wiki: false,
        homepage: 'https://github.com/VannaDii/devplat',
        name: repoName,
        private: false,
        visibility: 'public',
      },
      expectedStatuses: [201],
      method: 'POST',
    },
  );
}

async function hardenRepository({
  githubOrganization,
  githubRequest,
  repoName,
}) {
  const basePath = `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}`;

  await githubRequest(`${basePath}/interaction-limits`, {
    body: {
      expiry: 'one_month',
      limit: 'collaborators_only',
    },
    expectedStatuses: [200],
    method: 'PUT',
  });

  await githubRequest(`${basePath}/actions/permissions`, {
    body: {
      allowed_actions: 'selected',
      enabled: true,
      sha_pinning_required: true,
    },
    expectedStatuses: [204],
    method: 'PUT',
    responseType: 'none',
  });

  await githubRequest(`${basePath}/actions/permissions/selected-actions`, {
    body: {
      github_owned_allowed: true,
      patterns_allowed: [],
      verified_allowed: false,
    },
    expectedStatuses: [204],
    method: 'PUT',
    responseType: 'none',
  });

  await githubRequest(`${basePath}/actions/permissions/workflow`, {
    body: {
      can_approve_pull_request_reviews: false,
      default_workflow_permissions: 'read',
    },
    expectedStatuses: [204],
    method: 'PUT',
    responseType: 'none',
  });
}

async function seedRepository({
  fixtureFiles,
  githubOrganization,
  githubRequest,
  repoName,
}) {
  const basePath = `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}/contents`;

  for (const file of fixtureFiles) {
    await githubRequest(`${basePath}/${encodeRepositoryPath(file.path)}`, {
      body: {
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        message: `chore(fixtures): seed ${file.path}`,
      },
      expectedStatuses: [200, 201],
      method: 'PUT',
    });
  }
}

async function getRepository({ githubOrganization, githubRequest, repoName }) {
  return githubRequest(
    `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}`,
  );
}

async function createBranch({
  branchName,
  defaultBranch,
  githubOrganization,
  githubRequest,
  repoName,
}) {
  const basePath = `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}`;
  const branch = await githubRequest(
    `${basePath}/git/ref/heads/${encodeBranchName(defaultBranch)}`,
  );

  return githubRequest(`${basePath}/git/refs`, {
    body: {
      ref: `refs/heads/${branchName}`,
      sha: branch.object.sha,
    },
    expectedStatuses: [201],
    method: 'POST',
  });
}

async function createBranchCanary({
  branchName,
  githubOrganization,
  githubRequest,
  repoName,
  runLabel,
}) {
  const path = `.live-test/${runLabel}/canary.json`;
  const payload = {
    branchName,
    createdAt: new Date().toISOString(),
    runLabel,
  };

  return githubRequest(
    `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}/contents/${encodeRepositoryPath(path)}`,
    {
      body: {
        branch: branchName,
        content: Buffer.from(
          `${JSON.stringify(payload, null, 2)}\n`,
          'utf8',
        ).toString('base64'),
        message: `test(e2e): create ${path}`,
      },
      expectedStatuses: [200, 201],
      method: 'PUT',
    },
  );
}

async function createPullRequest({
  branchName,
  defaultBranch,
  githubOrganization,
  githubRequest,
  repoName,
  runLabel,
}) {
  return githubRequest(
    `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}/pulls`,
    {
      body: {
        base: defaultBranch,
        body: `Automated live-lab pull request for run ${runLabel}.`,
        head: branchName,
        title: `test(live-lab): ${runLabel}`,
      },
      expectedStatuses: [201],
      method: 'POST',
    },
  );
}

async function closePullRequest({
  githubOrganization,
  githubRequest,
  pullRequestNumber,
  repoName,
}) {
  return githubRequest(
    `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}/pulls/${String(pullRequestNumber)}`,
    {
      body: {
        state: 'closed',
      },
      expectedStatuses: [200],
      method: 'PATCH',
    },
  );
}

async function dispatchFixtureWorkflow({
  branchName,
  githubOrganization,
  githubRequest,
  repoName,
  runLabel,
}) {
  return githubRequest(
    `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}/actions/workflows/${encodeURIComponent(defaultWorkflowFileName)}/dispatches`,
    {
      body: {
        inputs: {
          branch_name: branchName,
          orchestration_run_id: runLabel,
        },
        ref: branchName,
      },
      expectedStatuses: [200, 204],
      method: 'POST',
    },
  );
}

async function waitForWorkflowRun({
  branchName,
  githubOrganization,
  githubRequest,
  pollDelayMs = defaultPollMs,
  repoName,
  timeoutMs = defaultWorkflowTimeoutMs,
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await githubRequest(
      `/repos/${encodeURIComponent(githubOrganization)}/${encodeURIComponent(repoName)}/actions/workflows/${encodeURIComponent(defaultWorkflowFileName)}/runs?branch=${encodeURIComponent(branchName)}&event=workflow_dispatch&per_page=10`,
    );
    const [run] = response.workflow_runs ?? [];
    if (run?.status === 'completed') {
      return run;
    }

    await sleep(pollDelayMs);
  }

  throw new Error(
    `Timed out waiting for ${defaultWorkflowFileName} to complete for ${branchName}.`,
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

async function waitForSonarProject({
  githubOrganization,
  repoName,
  sonarOrganization,
  sonarRequest,
  timeoutMs = defaultSonarProjectTimeoutMs,
}) {
  const projectKey = createSonarProjectKey(githubOrganization, repoName);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await sonarRequest(
      `/api/projects/search?organization=${encodeURIComponent(sonarOrganization)}&projects=${encodeURIComponent(projectKey)}`,
    );
    if (Array.isArray(response.components) && response.components.length > 0) {
      return {
        projectKey,
        project: response.components[0],
      };
    }

    await sleep(defaultPollMs);
  }

  throw new Error(`Timed out waiting for Sonar project ${projectKey}.`);
}

async function createSonarProject({
  projectKey,
  projectName,
  sonarOrganization,
  sonarRequest,
}) {
  return sonarRequest(
    `/api/projects/create?organization=${encodeURIComponent(sonarOrganization)}&project=${encodeURIComponent(projectKey)}&name=${encodeURIComponent(projectName)}`,
    {
      expectedStatuses: [200],
      method: 'POST',
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

async function getGuild(guildId, discordRequest) {
  return discordRequest(`/guilds/${encodeURIComponent(guildId)}`);
}

async function ensureDiscordCategory({
  categoryName,
  discordRequest,
  existingChannels,
  guildId,
}) {
  return (
    existingChannels.find(
      (candidate) => candidate.name === categoryName && candidate.type === 4,
    ) ??
    (await discordRequest(`/guilds/${encodeURIComponent(guildId)}/channels`, {
      body: {
        name: categoryName,
        type: 4,
      },
      expectedStatuses: [200, 201],
      method: 'POST',
    }))
  );
}

async function ensureDiscordChannels({
  categoryName = testDiscordCategoryName,
  discordRequest,
  guildId,
}) {
  const existingChannels = await listGuildChannels({
    discordRequest,
    guildId,
  });
  const testCategory = await ensureDiscordCategory({
    categoryName,
    discordRequest,
    existingChannels,
    guildId,
  });
  const channels = {};

  for (const channel of createDiscordChannelPlan(categoryName)) {
    const existingChannel = existingChannels.find(
      (candidate) =>
        candidate.name === channel.name &&
        candidate.type === 0 &&
        candidate.parent_id === testCategory.id,
    );

    channels[channel.key] =
      existingChannel ??
      (await discordRequest(`/guilds/${encodeURIComponent(guildId)}/channels`, {
        body: {
          name: channel.name,
          /**
           * Discord channel creation wire key used to nest test channels under the test category.
           */
          parent_id: testCategory.id,
          type: 0,
        },
        expectedStatuses: [200, 201],
        method: 'POST',
      }));
  }

  return {
    category: testCategory,
    channels,
  };
}

/**
 * Normalizes a plain status string or structured Discord payload into a message body.
 */
function createDiscordMessageBody(payload) {
  if (typeof payload === 'string') {
    return { content: payload };
  }

  return payload;
}

/**
 * Prefixes visible content while preserving structured Discord controls.
 */
function prefixDiscordMessageContent(prefix, payload) {
  if (typeof payload === 'string') {
    return `${prefix}${payload}`;
  }

  return {
    ...payload,
    content: `${prefix}${payload.content}`,
  };
}

/**
 * Posts a Discord message body without changing structured Discord controls.
 */
async function sendDiscordMessage(channelId, payload, discordRequest) {
  const body = createDiscordMessageBody(payload);
  const responseBody = await discordRequest(
    `/channels/${encodeURIComponent(channelId)}/messages`,
    {
      body,
      expectedStatuses: [200, 201],
      method: 'POST',
    },
  );

  return {
    body,
    responseBody,
  };
}

/**
 * Detects whether a structured Discord payload includes actionable controls.
 */
function hasDiscordActionComponents(payload) {
  return (
    Array.isArray(payload?.components) &&
    payload.components.some(
      (row) => Array.isArray(row?.components) && row.components.length > 0,
    )
  );
}

/**
 * Collects actionable Discord component identifiers from a structured payload.
 */
function collectDiscordComponentCustomIds(payload) {
  if (!Array.isArray(payload?.components)) {
    return [];
  }

  return payload.components.flatMap((row) => {
    if (!Array.isArray(row?.components)) {
      return [];
    }

    return row.components.flatMap((component) => {
      const customId = component?.[discordComponentCustomIdField];

      return typeof customId === 'string' ? [customId] : [];
    });
  });
}

/**
 * Reads the Discord message id returned by the transport receipt.
 */
function readDiscordReceiptMessageId(receipt) {
  const messageId = receipt?.responseBody?.id;

  return typeof messageId === 'string' ? messageId : null;
}

/**
 * Reads the visible Discord message content from a structured payload.
 */
function readDiscordPayloadContent(payload) {
  const content = payload?.content;

  return typeof content === 'string' ? content : null;
}

/**
 * Reads the visible Discord message content from the posted receipt body.
 */
function readDiscordReceiptContent(receipt) {
  return readDiscordPayloadContent(receipt?.body);
}

/**
 * Builds the auditable report projection for a posted Discord message.
 */
function createDiscordMessageReceiptReport({ channelId, receipt }) {
  return {
    channelId,
    componentCustomIds: collectDiscordComponentCustomIds(receipt.body),
    content: readDiscordReceiptContent(receipt),
    endpoint: `/channels/${encodeURIComponent(channelId)}/messages`,
    messageId: readDiscordReceiptMessageId(receipt),
  };
}

async function postStatus({
  channelId,
  details,
  discordRequest,
  phase,
  ref,
  repoFullName,
  runLabel,
  sha,
  status,
  workflowUrl,
}) {
  return sendDiscordMessage(
    channelId,
    createStatusMessage({
      controlThreadId: channelId,
      details,
      phase,
      ref,
      repoFullName,
      runLabel,
      sha,
      status,
      workflowUrl,
    }),
    discordRequest,
  );
}

async function postStatusSafe(options) {
  try {
    await postStatus(options);
  } catch {
    return null;
  }

  return true;
}

class LiveLabDiscordInteractionTransport {
  constructor({ auditChannelId, discordRequest }) {
    this.auditChannelId = auditChannelId;
    this.discordRequest = discordRequest;
  }

  async postInteractionResponse(input, content) {
    const endpoint = `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`;
    const receipt = await sendDiscordMessage(
      this.auditChannelId,
      prefixDiscordMessageContent('simulated interaction callback: ', content),
      this.discordRequest,
    );

    return {
      body: receipt.body,
      endpoint,
      responseBody: receipt.responseBody,
      statusCode: 201,
    };
  }

  async postInteractionDeferred(input) {
    const endpoint = `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`;
    const receipt = await sendDiscordMessage(
      this.auditChannelId,
      `simulated interaction deferred: ${input.id}`,
      this.discordRequest,
    );

    return {
      body: receipt.body,
      endpoint,
      responseBody: receipt.responseBody,
      statusCode: 201,
    };
  }

  async postThreadMessage(threadId, content) {
    const endpoint = `/channels/${encodeURIComponent(threadId)}/messages`;
    const receipt = await sendDiscordMessage(
      threadId,
      content,
      this.discordRequest,
    );

    return {
      body: receipt.body,
      endpoint,
      responseBody: receipt.responseBody,
      statusCode: 201,
    };
  }
}

async function createDiscordControlPlaneService({
  reportDirectory,
  transport,
}) {
  const discordModule = await import(
    pathToFileURL(resolve(repoRootDirectory, 'packages/discord/dist/index.js'))
      .href
  );
  const storageModule = await import(
    pathToFileURL(resolve(repoRootDirectory, 'packages/storage/dist/index.js'))
      .href
  );
  const store = new storageModule.FileStoreService(
    resolve(reportDirectory, 'discord-interactions'),
  );

  return new discordModule.DiscordControlPlaneService(
    undefined,
    undefined,
    store,
    transport,
  );
}

async function createDiscordApplicationCommandPayloads() {
  const discordModule = await import(
    pathToFileURL(resolve(repoRootDirectory, 'packages/discord/dist/index.js'))
      .href
  );

  return discordModule.createDiscordApplicationCommandPayloads();
}

async function createDiscordOperatorInteractionFromCallback(callback, options) {
  const discordModule = await import(
    pathToFileURL(resolve(repoRootDirectory, 'packages/discord/dist/index.js'))
      .href
  );

  return discordModule.createDiscordOperatorInteractionFromCallback(
    callback,
    options,
  );
}

export async function registerDiscordApplicationCommands(
  { applicationId, discordRequest, guildId },
  dependencies = {},
) {
  const payloadFactory =
    dependencies.createDiscordApplicationCommandPayloads ??
    createDiscordApplicationCommandPayloads;
  const payloads = await payloadFactory();
  const endpoint = `/applications/${encodeURIComponent(applicationId)}/guilds/${encodeURIComponent(guildId)}/commands`;
  const responseBody = await discordRequest(endpoint, {
    method: 'PUT',
    body: payloads,
  });

  return {
    endpoint,
    count: payloads.length,
    names: payloads.map((payload) => payload.name),
    responseBody,
  };
}

export async function runDiscordInteractionProbe(
  {
    discordChannels,
    discordRequest,
    reportDirectory,
    runLabel,
    updatedAt = new Date().toISOString(),
  },
  dependencies = {},
) {
  const serviceFactory =
    dependencies.createDiscordControlPlaneService ??
    createDiscordControlPlaneService;
  const interactionFactory =
    dependencies.createDiscordOperatorInteractionFromCallback ??
    createDiscordOperatorInteractionFromCallback;
  const threadId = discordChannels.implementation.id;
  const boundSession = {
    id: `live-lab-${runLabel}-session`,
    summary: 'Live-lab implementation thread',
    status: 'running',
    trace: [],
    updatedAt,
    guildId: 'live-lab-guild',
    channelId: threadId,
    parentChannelId: discordChannels.implementation.id,
    threadId,
    kind: 'implementation',
    specId: `live-lab-${runLabel}-spec`,
    sliceId: `live-lab-${runLabel}-slice`,
    pullRequestNumber: null,
    artifactId: `live-lab-${runLabel}-artifact`,
  };
  const transport = new LiveLabDiscordInteractionTransport({
    auditChannelId: discordChannels.audit.id,
    discordRequest,
  });
  const callback = {
    id: `live-lab-${runLabel}-retry-gates`,
    token: `simulated-token-${runLabel}`,
    channel_id: threadId,
    data: {
      name: 'retry-gates',
    },
    member: {
      user: {
        id: 'live-lab-operator',
      },
    },
  };
  const interaction = await interactionFactory(callback, {
    threadId,
    boundThreadId: threadId,
    boundSession,
    summary: 'Live-lab simulated retry gates interaction',
    privileged: false,
    updatedAt,
  });
  const service = await serviceFactory({
    auditChannelId: discordChannels.audit.id,
    discordRequest,
    reportDirectory,
    transport,
  });
  const result = await service.handleInteraction(interaction);

  if (result.allowed !== true || result.failedClosed === true) {
    throw new Error('Discord interaction probe failed closed.');
  }

  if (result.request.threadId !== threadId) {
    throw new Error('Discord interaction probe resolved the wrong thread.');
  }

  if (
    result.responseReceipt?.endpoint === undefined ||
    result.threadReceipt?.endpoint === undefined
  ) {
    throw new Error('Discord interaction probe did not record receipts.');
  }

  if (
    !hasDiscordActionComponents(result.responsePayload) ||
    !hasDiscordActionComponents(result.threadPayload)
  ) {
    throw new Error(
      'Discord interaction probe did not publish actionable controls.',
    );
  }

  return {
    action: result.request.action,
    allowed: result.allowed,
    componentCustomIds: collectDiscordComponentCustomIds(result.threadPayload),
    componentRows: result.threadPayload.components.length,
    commandName: interaction.commandName,
    failedClosed: result.failedClosed,
    interactionEndpoint: result.responseReceipt.endpoint,
    interactionMessageId: readDiscordReceiptMessageId(result.responseReceipt),
    policyDecisionId: result.policyDecisionId,
    responseContent: readDiscordReceiptContent(result.responseReceipt),
    threadContent: readDiscordReceiptContent(result.threadReceipt),
    threadEndpoint: result.threadReceipt.endpoint,
    threadId: result.request.threadId,
    threadMessageId: readDiscordReceiptMessageId(result.threadReceipt),
    workItem: result.workItem ?? null,
  };
}

async function cleanupLiveLabResources({
  githubOrganization,
  githubRequest,
  identifiers,
  report,
  retainFailedResources,
  repoCreated,
  repoFullName,
  sonarProjectKey,
  sonarRequest,
}) {
  const shouldCleanupResources =
    report.status === 'passed' || !retainFailedResources;
  let cleanupFailure = null;

  if (!repoCreated) {
    report.cleanup.repository.status = 'not-created';
  } else if (!shouldCleanupResources) {
    report.cleanup.repository.status = 'retained';
  } else {
    try {
      await deleteRepository({
        githubOrganization,
        githubRequest,
        repoName: identifiers.repoName,
      });
      report.cleanup.repository.status = 'deleted';
    } catch (error) {
      report.cleanup.repository.error = serializeError(error);
      report.cleanup.repository.status = 'failed';
      cleanupFailure ??= new Error(
        `Failed to delete live-lab repository ${repoFullName}.`,
      );
    }
  }

  if (sonarProjectKey === null) {
    report.cleanup.sonarProject.status = 'not-created';
  } else if (!shouldCleanupResources) {
    report.cleanup.sonarProject.status = 'retained';
  } else {
    try {
      await deleteSonarProject({
        projectKey: sonarProjectKey,
        sonarRequest,
      });
      report.cleanup.sonarProject.status = 'deleted';
    } catch (error) {
      report.cleanup.sonarProject.error = serializeError(error);
      report.cleanup.sonarProject.status = 'failed';
      cleanupFailure ??= new Error(
        `Failed to delete Sonar project ${sonarProjectKey}.`,
      );
    }
  }

  return cleanupFailure;
}

async function postFinalLiveLabStatus({
  cleanupFailure,
  discordRequest,
  ref,
  report,
  repoFullName,
  runLabel,
  sha,
  sonarProjectKey,
  workflowUrl,
}) {
  if (report.discord === null) {
    return;
  }

  if (cleanupFailure === null) {
    await postStatusSafe({
      channelId: report.discord.channels.projectManagement.id,
      details: 'Live lab completed successfully.',
      discordRequest,
      phase: 'complete',
      ref,
      repoFullName,
      runLabel,
      sha,
      status: 'passed',
      workflowUrl,
    });
    await postStatusSafe({
      channelId: report.discord.channels.audit.id,
      details: `Fixture repo ${repoFullName} and Sonar project ${sonarProjectKey} validated successfully.`,
      discordRequest,
      phase: 'complete',
      ref,
      repoFullName,
      runLabel,
      sha,
      status: 'passed',
      workflowUrl,
    });
    return;
  }

  await postStatusSafe({
    channelId: report.discord.channels.audit.id,
    details: cleanupFailure.message,
    discordRequest,
    phase: 'failure',
    ref,
    repoFullName,
    runLabel,
    sha,
    status: 'failed',
    workflowUrl,
  });
  await postStatusSafe({
    channelId: report.discord.channels.projectManagement.id,
    details:
      'Live lab failed during cleanup. Inspect the uploaded report and shared live-lab channels for details.',
    discordRequest,
    phase: 'failure',
    ref,
    repoFullName,
    runLabel,
    sha,
    status: 'failed',
    workflowUrl,
  });
}

async function listGuildChannels({ discordRequest, guildId }) {
  return discordRequest(`/guilds/${encodeURIComponent(guildId)}/channels`);
}

async function postEvictionNotices({
  categoryName,
  discordRequest,
  guildId,
  newRunAuditChannelId,
  ref,
  repoFullName,
  runLabel,
  sha,
  workflowUrl,
}) {
  const guildChannels = await listGuildChannels({
    discordRequest,
    guildId,
  }).catch(() => []);
  const category = guildChannels.find(
    (channel) => channel.type === 4 && channel.name === categoryName,
  );
  const childChannels =
    category === undefined
      ? []
      : guildChannels.filter((channel) => channel.parent_id === category.id);
  const auditChannel = childChannels.find(
    (channel) => channel.name === 'audit',
  );
  const managementChannel = childChannels.find(
    (channel) => channel.name === 'project-management',
  );

  for (const channel of [auditChannel, managementChannel]) {
    if (channel === undefined) {
      continue;
    }

    await postStatusSafe({
      channelId: channel.id,
      details: `The oldest live-lab repository ${categoryName} is being evicted to free a concurrency slot.`,
      discordRequest,
      phase: 'eviction',
      ref,
      repoFullName,
      runLabel,
      sha,
      status: 'evicted',
      workflowUrl,
    });
  }

  await postStatusSafe({
    channelId: newRunAuditChannelId,
    details: `Evicted oldest live-lab repository ${categoryName} because the cap was reached.`,
    discordRequest,
    phase: 'eviction',
    ref,
    repoFullName,
    runLabel,
    sha,
    status: 'in-progress',
    workflowUrl,
  });
}

function createDefaultReportDirectory(runLabel) {
  return resolve(
    tmpdir(),
    `${defaultReportPrefix}-${sanitizeSegment(runLabel)}-${randomUUID()}`,
  );
}

export async function runLiveLab(options, dependencies = {}) {
  const appendSummaryFn = dependencies.appendSummary ?? appendSummary;
  const collectFixtureFilesFn =
    dependencies.collectFixtureFiles ?? collectFixtureFiles;
  const discordRequest =
    dependencies.discordRequest ??
    createDiscordRequest({
      baseUrl: options.environment.discord.baseUrl,
      botToken: options.environment.discord.botToken,
      fetchImpl: dependencies.fetchImpl,
    });
  const githubRequest =
    dependencies.githubRequest ??
    createGitHubRequest({
      fetchImpl: dependencies.fetchImpl,
      token: options.environment.github.token,
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
  const runDeepTestFn = dependencies.runDeepTest ?? runDeepTest;
  const runDiscordInteractionProbeFn =
    dependencies.runDiscordInteractionProbe ?? runDiscordInteractionProbe;
  const registerDiscordApplicationCommandsFn =
    dependencies.registerDiscordApplicationCommands ??
    registerDiscordApplicationCommands;
  const sleepFn = dependencies.sleep ?? sleep;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;

  const identifiers = createRunIdentifiers({
    runAttempt: options.environment.githubWorkflow.runAttempt,
    runNumber: options.environment.githubWorkflow.runNumber,
  });
  const effectiveRef = options.ref ?? options.environment.githubWorkflow.ref;
  const repoFullName = `${options.environment.github.organization}/${identifiers.repoName}`;
  const sonarProjectTarget = createSonarProjectKey(
    options.environment.github.organization,
    identifiers.repoName,
  );
  const reportDirectory =
    options.reportDir ?? createDefaultReportDirectory(identifiers.runLabel);
  const workflowUrl = resolveWorkflowUrl({
    repository: options.environment.githubWorkflow.repository,
    runId: options.environment.githubWorkflow.runId,
    serverUrl: options.environment.githubWorkflow.serverUrl,
  });
  const report = {
    cleanup: {
      repository: {
        status: 'pending',
        target: repoFullName,
      },
      sonarProject: {
        status: 'pending',
        target: sonarProjectTarget,
      },
    },
    discord: null,
    evictedRepository: undefined,
    github: null,
    ref: effectiveRef,
    runLabel: identifiers.runLabel,
    status: 'running',
    workflowUrl,
  };

  let caughtError = null;
  let cleanupFailure;
  let repoCreated = false;
  let sonarProjectKey = null;
  await makeDirectory(reportDirectory, { recursive: true });

  try {
    await getGuild(options.environment.discord.guildId, discordRequest);
    const githubOwnerKind = await resolveGitHubOwnerKind({
      githubOwner: options.environment.github.organization,
      githubRequest,
    });
    await sonarRequest(
      `/api/projects/search?organization=${encodeURIComponent(options.environment.sonar.organization)}&ps=1`,
    );

    const discordChannels = await ensureDiscordChannels({
      categoryName:
        options.environment.discord.categoryName ?? testDiscordCategoryName,
      discordRequest,
      guildId: options.environment.discord.guildId,
    });
    report.discord = {
      category: {
        id: discordChannels.category.id,
        name: discordChannels.category.name,
      },
      channelNames: createDiscordChannelPlan(discordChannels.category.name).map(
        (channel) => channel.name,
      ),
      channels: Object.fromEntries(
        Object.entries(discordChannels.channels).map(([key, channel]) => [
          key,
          {
            id: channel.id,
            name: channel.name,
            parentId: channel.parent_id ?? null,
          },
        ]),
      ),
    };
    report.discord.commandRegistration =
      await registerDiscordApplicationCommandsFn({
        applicationId: options.environment.discord.applicationId,
        discordRequest,
        guildId: options.environment.discord.guildId,
      });

    const bootstrapChannelId = discordChannels.channels.projectManagement.id;
    const bootstrapStatusReceipt = await postStatus({
      channelId: bootstrapChannelId,
      details:
        'Bootstrapped the shared live-lab channels and external service preflight.',
      discordRequest,
      phase: 'bootstrap',
      ref: effectiveRef,
      repoFullName,
      runLabel: identifiers.runLabel,
      sha: options.environment.githubWorkflow.sha,
      status: 'in-progress',
      workflowUrl,
    });
    report.discord.bootstrapStatus = createDiscordMessageReceiptReport({
      channelId: bootstrapChannelId,
      receipt: bootstrapStatusReceipt,
    });

    const repositories = await listRepositories({
      githubOrganization: options.environment.github.organization,
      githubOwnerKind,
      githubRequest,
    });
    const evictionPlan = createEvictionPlan(
      repositories,
      options.maxParallelRepos,
    );
    if (evictionPlan !== null) {
      report.evictedRepository = evictionPlan.candidate.name;
      await postEvictionNotices({
        categoryName: evictionPlan.candidate.name,
        discordRequest,
        guildId: options.environment.discord.guildId,
        newRunAuditChannelId: discordChannels.channels.audit.id,
        ref: effectiveRef,
        repoFullName,
        runLabel: identifiers.runLabel,
        sha: options.environment.githubWorkflow.sha,
        workflowUrl,
      });

      await deleteRepository({
        githubOrganization: options.environment.github.organization,
        githubRequest,
        repoName: evictionPlan.candidate.name,
      });

      await deleteSonarProject({
        projectKey: createSonarProjectKey(
          options.environment.github.organization,
          evictionPlan.candidate.name,
        ),
        sonarRequest,
      }).catch(() => undefined);
    }

    const repository = await createRepository({
      githubOrganization: options.environment.github.organization,
      githubOwnerKind,
      githubRequest,
      repoName: identifiers.repoName,
    });
    repoCreated = true;
    report.github = {
      createdAt: repository.created_at,
      htmlUrl: repository.html_url,
      repoFullName: repository.full_name,
      repoName: repository.name,
    };

    await hardenRepository({
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
    });

    const fixtureFiles = await collectFixtureFilesFn(fixtureRootDirectory);
    await seedRepository({
      fixtureFiles,
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
    });

    const hydratedRepository = await getRepository({
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
    });
    const defaultBranch = hydratedRepository.default_branch;

    await createBranch({
      branchName: identifiers.branchName,
      defaultBranch,
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
    });
    await createBranchCanary({
      branchName: identifiers.branchName,
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
      runLabel: identifiers.runLabel,
    });

    const pullRequest = await createPullRequest({
      branchName: identifiers.branchName,
      defaultBranch,
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
      runLabel: identifiers.runLabel,
    });
    report.github.pullRequestNumber = pullRequest.number;

    await dispatchFixtureWorkflow({
      branchName: identifiers.branchName,
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
      runLabel: identifiers.runLabel,
    });

    const workflowRun = await waitForWorkflowRun({
      branchName: identifiers.branchName,
      githubOrganization: options.environment.github.organization,
      githubRequest,
      repoName: identifiers.repoName,
    });
    report.github.workflowRun = {
      conclusion: workflowRun.conclusion,
      htmlUrl: workflowRun.html_url,
      id: workflowRun.id,
      status: workflowRun.status,
    };
    if (workflowRun.conclusion !== 'success') {
      throw new Error(
        `Fixture workflow ${workflowRun.id} finished with ${workflowRun.conclusion}.`,
      );
    }

    await closePullRequest({
      githubOrganization: options.environment.github.organization,
      githubRequest,
      pullRequestNumber: pullRequest.number,
      repoName: identifiers.repoName,
    });

    if (githubOwnerKind === 'user') {
      sonarProjectKey = createSonarProjectKey(
        options.environment.github.organization,
        identifiers.repoName,
      );
      const sonarProject = await createSonarProject({
        projectKey: sonarProjectKey,
        projectName: identifiers.repoName,
        sonarOrganization: options.environment.sonar.organization,
        sonarRequest,
      });
      report.sonar = {
        projectKey: sonarProjectKey,
        projectName: sonarProject?.project?.name ?? identifiers.repoName,
      };
    } else {
      const sonarProject = await waitForSonarProject({
        githubOrganization: options.environment.github.organization,
        repoName: identifiers.repoName,
        sonarOrganization: options.environment.sonar.organization,
        sonarRequest,
      });
      sonarProjectKey = sonarProject.projectKey;
      report.sonar = {
        projectKey: sonarProject.projectKey,
        projectName: sonarProject.project.name,
      };
    }

    const runtimeEnv = createLiveRuntimeEnv({
      discordChannels: discordChannels.channels,
      discordConfig: options.environment.discord,
      githubOrganization: options.environment.github.organization,
      repoName: identifiers.repoName,
      sonarOrganization: options.environment.sonar.organization,
    });

    let interactionProbeReport = null;
    const deepTestReport = await runDeepTestFn(
      {
        beforeCleanup: async () => {
          interactionProbeReport = await runDiscordInteractionProbeFn({
            discordChannels: discordChannels.channels,
            discordRequest,
            reportDirectory,
            runLabel: identifiers.runLabel,
          });
          const operatorHoldMs =
            options.operatorHoldMs ?? defaultOperatorHoldMs;
          if (operatorHoldMs > 0) {
            await sleepFn(operatorHoldMs);
          }
        },
        image: options.image,
        mode: 'live',
        reportDir: resolve(reportDirectory, 'deep-test'),
        retainContainerOnFailure:
          options.retainFailedResources || options.retainContainerOnFailure,
        runtimeEnv,
        skipBuild: options.skipBuild,
      },
      {
        onProgress: async (progress) => {
          const channelKey = mapProgressToChannel(progress);
          const channelId = discordChannels.channels[channelKey].id;
          await postStatusSafe({
            channelId,
            details:
              progress.message ??
              (typeof progress.step === 'string'
                ? `Executing ${progress.step}.`
                : 'Progress update.'),
            discordRequest,
            phase: progress.phase,
            ref: effectiveRef,
            repoFullName,
            runLabel: identifiers.runLabel,
            sha: options.environment.githubWorkflow.sha,
            status: 'in-progress',
            workflowUrl,
          });
        },
      },
    );
    report.deepTest = {
      reportDirectory: deepTestReport.reportDirectory,
      steps: deepTestReport.steps.length,
    };
    report.discord.interactionProbe =
      interactionProbeReport ??
      (await runDiscordInteractionProbeFn({
        discordChannels: discordChannels.channels,
        discordRequest,
        reportDirectory,
        runLabel: identifiers.runLabel,
      }));

    report.status = 'passed';
  } catch (error) {
    caughtError = error;
    report.error = serializeError(error);
    report.status = 'failed';

    if (report.discord !== null) {
      await postStatusSafe({
        channelId: report.discord.channels.audit.id,
        details: report.error.message,
        discordRequest,
        phase: 'failure',
        ref: effectiveRef,
        repoFullName:
          report.github?.repoFullName ??
          `${options.environment.github.organization}/${identifiers.repoName}`,
        runLabel: identifiers.runLabel,
        sha: options.environment.githubWorkflow.sha,
        status: 'failed',
        workflowUrl,
      });
      await postStatusSafe({
        channelId: report.discord.channels.projectManagement.id,
        details:
          'Live lab failed. Inspect the uploaded report and shared live-lab channels for details.',
        discordRequest,
        phase: 'failure',
        ref: effectiveRef,
        repoFullName:
          report.github?.repoFullName ??
          `${options.environment.github.organization}/${identifiers.repoName}`,
        runLabel: identifiers.runLabel,
        sha: options.environment.githubWorkflow.sha,
        status: 'failed',
        workflowUrl,
      });
    }
  } finally {
    cleanupFailure = await cleanupLiveLabResources({
      githubOrganization: options.environment.github.organization,
      githubRequest,
      identifiers,
      report,
      retainFailedResources: options.retainFailedResources,
      repoCreated,
      repoFullName,
      sonarProjectKey,
      sonarRequest,
    });

    if (caughtError === null && cleanupFailure !== null) {
      report.error = serializeError(cleanupFailure);
      report.status = 'failed';
    }

    if (caughtError === null) {
      await postFinalLiveLabStatus({
        cleanupFailure,
        discordRequest,
        ref: effectiveRef,
        report,
        repoFullName,
        runLabel: identifiers.runLabel,
        sha: options.environment.githubWorkflow.sha,
        sonarProjectKey,
        workflowUrl,
      });
    }

    report.completedAt = new Date().toISOString();
    report.reportDirectory = reportDirectory;
    await writeTextFile(
      resolve(reportDirectory, 'live-lab-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await appendSummaryFn(
      options.environment.githubWorkflow.stepSummaryPath,
      createStepSummary(report),
    );

    if (report.status === 'passed' && options.cleanupReportDir === true) {
      await removeDirectory(reportDirectory, { force: true, recursive: true });
    }
  }

  if (caughtError !== null) {
    throw caughtError;
  }

  if (cleanupFailure !== null) {
    throw cleanupFailure;
  }

  return report;
}

export async function main(
  argv = process.argv.slice(2),
  {
    createEnvironment = loadLiveLabEnvironment,
    runLiveLabFn = runLiveLab,
    writeOutput = (content) => {
      process.stdout.write(content);
    },
  } = {},
) {
  const args = parseLiveLabArgs(argv);
  const environment = await createEnvironment();
  const report = await runLiveLabFn({
    ...args,
    environment,
    maxParallelRepos: args.maxParallelRepos ?? defaultMaxParallelRepos,
  });

  writeOutput(
    `${JSON.stringify(
      {
        completedAt: report.completedAt,
        reportDirectory: report.reportDirectory,
        repository: report.github?.repoFullName ?? null,
        runLabel: report.runLabel,
        status: report.status,
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
