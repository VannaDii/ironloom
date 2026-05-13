import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import {
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
} from '@vannadii/devplat-core';
import { FileStoreService } from '@vannadii/devplat-storage';
import { renderDiscordActionComponentRows } from '@vannadii/devplat-discord';

import { createRuntimeEnv, runDeepTest } from './openclaw-deep-test.mjs';
import { createDiscordRequest } from './openclaw-live-lab.mjs';

const defaultDiscordApiBaseUrl = 'https://discord.com/api/v10';
const defaultDiscordInspectPort = 9230;
const defaultOpenClawInspectPort = 9229;
const defaultRepositoryName = 'devplat';
const defaultGitHubOwner = 'VannaDii';
const defaultSonarOrganization = 'vannadii';
const discordCategoryChannelType = 4;
const discordPublicThreadChannelType = 11;
const discordTextChannelType = 0;
const discordSuppressEmbedsMessageFlag = 4;
const localStackThreadAutoArchiveMinutes = 60;
const shutdownPollMs = 250;

/**
 * Discord control actions rendered on the local startup panel.
 */
export const localStackActionPanelActions = [
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
];

const localStackChannelPlan = [
  { key: 'spec', name: 'spec' },
  { key: 'implementation', name: 'implementation' },
  { key: 'pullRequest', name: 'pull-request' },
  { key: 'audit', name: 'audit' },
  { key: 'projectManagement', name: 'project-management' },
];

/**
 * Parses simple `--flag value` CLI arguments.
 */
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

/**
 * Parses a positive TCP port from a CLI option.
 */
function parsePortFlag(args, flag, fallback) {
  const value = args.get(flag);
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string') {
    throw new Error(`${flag} requires a port value.`);
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${flag} must be a TCP port between 1 and 65535.`);
  }

  return port;
}

/**
 * Parses local-stack CLI options.
 */
export function parseLocalStackArgs(argv) {
  const args = parseFlagArguments(argv);

  return {
    discordInspectPort: parsePortFlag(
      args,
      '--discord-inspect-port',
      defaultDiscordInspectPort,
    ),
    openclawInspectPort: parsePortFlag(
      args,
      '--openclaw-inspect-port',
      defaultOpenClawInspectPort,
    ),
  };
}

/**
 * Reads a required environment value with a direct troubleshooting message.
 */
function readRequiredEnvironmentValue(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} is required for the local Discord stack.`);
  }

  return value;
}

/**
 * Creates the runtime-independent environment needed to start the local stack.
 */
function createLocalStackEnvironment(env = process.env) {
  const githubOwner =
    env.GITHUB_OWNER ?? env.LIVE_TEST_GITHUB_ORG ?? defaultGitHubOwner;
  const repoName = env.GITHUB_REPO ?? defaultRepositoryName;

  return {
    discord: {
      applicationId: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_APPLICATION_ID',
      ),
      baseUrl: env.LIVE_TEST_DISCORD_API_BASE_URL ?? defaultDiscordApiBaseUrl,
      botToken: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_BOT_TOKEN',
      ),
      categoryName: `devplat-local-${randomUUID().slice(0, 8)}`,
      guildId: readRequiredEnvironmentValue(env, 'LIVE_TEST_DISCORD_GUILD_ID'),
      publicKey: readRequiredEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_PUBLIC_KEY',
      ),
    },
    githubOwner,
    repoName,
    sonarOrganization:
      env.SONAR_ORGANIZATION ??
      env.LIVE_TEST_SONAR_ORGANIZATION ??
      defaultSonarOrganization,
  };
}

/**
 * Builds the OpenClaw/Discord runtime environment from disposable local channels.
 */
export function createLocalStackRuntimeEnv({
  discord,
  discordChannels,
  githubOwner,
  repoName,
  sonarOrganization,
}) {
  return createRuntimeEnv({
    DISCORD_API_BASE_URL: discord.baseUrl,
    DISCORD_APPLICATION_ID: discord.applicationId,
    DISCORD_AUDIT_CHANNEL_ID: discordChannels.audit.id,
    DISCORD_BOT_TOKEN: discord.botToken,
    DISCORD_CATEGORY_NAME: discord.categoryName,
    DISCORD_DEFAULT_GUILD_ID: discord.guildId,
    DISCORD_IMPLEMENTATION_CHANNEL_ID: discordChannels.implementation.id,
    DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID: discordChannels.projectManagement.id,
    DISCORD_PUBLIC_KEY: discord.publicKey,
    DISCORD_PULL_REQUEST_CHANNEL_ID: discordChannels.pullRequest.id,
    DISCORD_SPEC_CHANNEL_ID: discordChannels.spec.id,
    GITHUB_OWNER: githubOwner,
    GITHUB_REPO: repoName,
    SONAR_ORGANIZATION: sonarOrganization,
    SONAR_PROJECT_KEY: `${githubOwner}_${repoName}`,
  });
}

/**
 * Creates a disposable category and channels for local interaction debugging.
 */
async function createDiscordSandboxChannels({ discord, discordRequest }) {
  const category = await discordRequest(
    `/guilds/${encodeURIComponent(discord.guildId)}/channels`,
    {
      body: {
        name: discord.categoryName,
        type: discordCategoryChannelType,
      },
      expectedStatuses: [200, 201],
      method: 'POST',
    },
  );
  const createdChannelIds = [category.id];
  const channels = {};

  for (const channel of localStackChannelPlan) {
    const created = await discordRequest(
      `/guilds/${encodeURIComponent(discord.guildId)}/channels`,
      {
        body: {
          name: channel.name,
          parent_id: category.id,
          type: discordTextChannelType,
        },
        expectedStatuses: [200, 201],
        method: 'POST',
      },
    );
    channels[channel.key] = created;
    createdChannelIds.push(created.id);
  }

  return {
    category,
    channels,
    createdChannelIds,
  };
}

/**
 * Creates the implementation thread that owns the local action panel.
 */
async function createLocalStackThread({ discordChannels, discordRequest }) {
  const thread = await discordRequest(
    `/channels/${encodeURIComponent(discordChannels.implementation.id)}/threads`,
    {
      body: {
        auto_archive_duration: localStackThreadAutoArchiveMinutes,
        name: 'devplat-local-actions',
        type: discordPublicThreadChannelType,
      },
      expectedStatuses: [200, 201],
      method: 'POST',
    },
  );

  return {
    id: thread.id,
    parentChannelId: discordChannels.implementation.id,
  };
}

/**
 * Creates the persisted thread session that lets Gateway callbacks route.
 */
function createLocalThreadSession({ discord, thread }) {
  const updatedAt = new Date().toISOString();

  return {
    artifactId: `artifact-local-discord-session-${thread.id}`,
    channelId: thread.id,
    guildId: discord.guildId,
    id: `local-discord-session-${thread.id}`,
    kind: 'implementation',
    parentChannelId: thread.parentChannelId,
    pullRequestNumber: null,
    sliceId: `local-stack-${thread.id}`,
    specId: null,
    status: 'accepted',
    summary: 'Local Discord action panel',
    threadId: thread.id,
    trace: ['local-stack:started'],
    updatedAt,
  };
}

/**
 * Persists a Gateway-bound Discord thread session into the mounted state store.
 */
async function persistLocalThreadSession({ devplatStateDirectory, session }) {
  const store = new FileStoreService(devplatStateDirectory);
  await store.store({
    id: session.id,
    key: session.id,
    payload: session,
    scope: 'state',
    status: session.status,
    summary: session.summary,
    trace: session.trace,
    updatedAt: session.updatedAt,
  });
}

/**
 * Renders the single local startup action-panel message.
 */
export function createLocalActionPanelPayload({
  actorId = 'local-operator',
  artifactId,
  channelId,
  parentChannelId,
  sliceId,
  threadId,
  updatedAt,
}) {
  const request = {
    action: DEVPLAT_ACTION_SHOW_STATUS,
    actorId,
    channelId,
    id: `local-action-panel-${threadId}`,
    privileged: false,
    status: 'accepted',
    summary: 'Local Discord action panel',
    threadId,
    trace: ['local-stack:panel'],
    updatedAt,
    workItem: {
      artifactId,
      sliceId,
      threadId,
      threadKind: 'implementation',
    },
  };

  return {
    allowed_mentions: { parse: [] },
    components: renderDiscordActionComponentRows(
      request,
      localStackActionPanelActions,
    ),
    content: [
      '🟡 DevPlat · Local action panel',
      '',
      'Status: online',
      `Scope: implementation · ${threadId}`,
      `Item: ${sliceId}`,
      `Parent: ${parentChannelId}`,
      'Actor: local-stack',
      '→ Local stack is ready for interaction debugging.',
    ].join('\n'),
    flags: discordSuppressEmbedsMessageFlag,
  };
}

/**
 * Posts the local action panel and returns Discord identifiers for logging.
 */
async function postLocalActionPanel({ discordRequest, session }) {
  const responseBody = await discordRequest(
    `/channels/${encodeURIComponent(session.threadId)}/messages`,
    {
      body: createLocalActionPanelPayload({
        actorId: 'local-operator',
        artifactId: session.artifactId,
        channelId: session.channelId,
        guildId: session.guildId,
        parentChannelId: session.parentChannelId,
        sliceId: session.sliceId,
        threadId: session.threadId,
        updatedAt: session.updatedAt,
      }),
      expectedStatuses: [200, 201],
      method: 'POST',
    },
  );

  return {
    id: responseBody.id,
    threadId: session.threadId,
  };
}

/**
 * Deletes Discord channels created by the local stack.
 */
async function cleanupDiscordResources({ createdChannelIds, discordRequest }) {
  for (const channelId of createdChannelIds.toReversed()) {
    await discordRequest(`/channels/${encodeURIComponent(channelId)}`, {
      expectedStatuses: [200, 202, 204, 404],
      method: 'DELETE',
    }).catch(() => undefined);
  }
}

/**
 * Creates a process-bound shutdown wait that keeps cleanup in JS control.
 */
function createShutdownWait(processLike = process) {
  let shutdownSignal;
  const listeners = new Set();
  const recordShutdown = (signal) => {
    shutdownSignal = signal;
    for (const listener of listeners) {
      listener();
    }
  };

  processLike.once('SIGINT', () => recordShutdown('SIGINT'));
  processLike.once('SIGTERM', () => recordShutdown('SIGTERM'));

  return async () => {
    while (shutdownSignal === undefined) {
      await new Promise((resolve) => {
        listeners.add(resolve);
        sleep(shutdownPollMs).then(resolve);
      });
      listeners.clear();
    }

    return shutdownSignal;
  };
}

/**
 * Starts Discord resources after the runtime is healthy, then waits to clean up.
 */
async function holdLocalStack({
  devplatStateDirectory,
  discordRequest,
  inspectPorts,
  reportDirectory,
  session,
  waitForShutdown,
}) {
  await persistLocalThreadSession({ devplatStateDirectory, session });
  const message = await postLocalActionPanel({ discordRequest, session });

  process.stdout.write(
    [
      'DevPlat local stack is online.',
      `Discord thread: ${message.threadId}`,
      `Discord message: ${message.id}`,
      `OpenClaw inspector: 127.0.0.1:${String(inspectPorts.openclawInspectPort)}`,
      `Discord Gateway inspector: 127.0.0.1:${String(inspectPorts.discordInspectPort)}`,
      `Report directory: ${reportDirectory}`,
      'Press Ctrl-C to stop and remove local resources.',
      '',
    ].join('\n'),
  );

  await waitForShutdown();
}

/**
 * Runs the local stack until the operator requests shutdown.
 */
export async function runLocalStack(options = {}) {
  const inspectPorts = {
    discordInspectPort: options.discordInspectPort ?? defaultDiscordInspectPort,
    openclawInspectPort:
      options.openclawInspectPort ?? defaultOpenClawInspectPort,
  };
  const environment = options.environment ?? createLocalStackEnvironment();
  const discordRequest =
    options.discordRequest ??
    createDiscordRequest({
      baseUrl: environment.discord.baseUrl,
      botToken: environment.discord.botToken,
    });
  const waitForShutdown = options.waitForShutdown ?? createShutdownWait();
  const createdChannelIds = [];

  try {
    const sandbox = await createDiscordSandboxChannels({
      discord: environment.discord,
      discordRequest,
    });
    createdChannelIds.push(...sandbox.createdChannelIds);
    const thread = await createLocalStackThread({
      discordChannels: sandbox.channels,
      discordRequest,
    });
    createdChannelIds.push(thread.id);
    const session = createLocalThreadSession({
      discord: environment.discord,
      thread,
    });
    const runtimeEnv = {
      ...createLocalStackRuntimeEnv({
        discord: environment.discord,
        discordChannels: sandbox.channels,
        githubOwner: environment.githubOwner,
        repoName: environment.repoName,
        sonarOrganization: environment.sonarOrganization,
      }),
      DISCORD_GATEWAY_NODE_OPTIONS: `--inspect=0.0.0.0:${String(
        inspectPorts.discordInspectPort,
      )}`,
      OPENCLAW_GATEWAY_NODE_OPTIONS: `--inspect=0.0.0.0:${String(
        inspectPorts.openclawInspectPort,
      )}`,
    };

    await runDeepTest(
      {
        cleanupReportDir: true,
        mode: 'live',
        portBindings: [
          {
            containerPort: inspectPorts.openclawInspectPort,
            hostPort: inspectPorts.openclawInspectPort,
          },
          {
            containerPort: inspectPorts.discordInspectPort,
            hostPort: inspectPorts.discordInspectPort,
          },
        ],
        runtimeEnv,
        scenario: [],
        beforeCleanup: async ({ devplatStateDirectory, reportDirectory }) => {
          await holdLocalStack({
            devplatStateDirectory,
            discordRequest,
            inspectPorts,
            reportDirectory,
            session,
            waitForShutdown,
          });
        },
      },
      {
        validateReport: () => true,
      },
    );
  } finally {
    await cleanupDiscordResources({ createdChannelIds, discordRequest });
  }
}

/**
 * Runs the local stack CLI.
 */
async function main() {
  await runLocalStack(parseLocalStackArgs(process.argv.slice(2)));
}

const entryPath =
  process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;

if (entryPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
