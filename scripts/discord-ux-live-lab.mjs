import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  collectDiscordComponentCustomIds,
  createDiscordChannelPlan,
  createDiscordRequest,
  createDiscordMessageReceiptReport,
  createLiveLabImplementationThread,
  discordComponentCustomIdField,
  ensureDiscordChannels,
  getGuild,
  LiveLabDiscordInteractionTransport,
  persistDiscordGatewayBoundSession,
  readDiscordReceiptMessageId,
  registerDiscordApplicationCommands,
  resolveWorkspacePackageEntrypoint,
  testDiscordCategoryName,
} from './discord-live-lab-harness.mjs';

/**
 * Promisified child process executor used for changed-file detection.
 */
const execFileAsync = promisify(execFile);

/**
 * Default report file emitted by the Discord UX live-lab script.
 */
const discordUxLiveLabReportFileName = 'discord-ux-live-lab-report.json';

/**
 * Interaction-probe report file emitted before the top-level report is finalized.
 */
const discordUxInteractionProbeReportFileName =
  'discord-ux-interaction-probe.json';

/**
 * Default Discord API base used by the live UX suite.
 */
const defaultDiscordApiBaseUrl = 'https://discord.com/api/v10';

/**
 * Default run number used by local live UX invocations.
 */
const defaultRunNumber = 'local';

/**
 * Default run attempt used by local live UX invocations.
 */
const defaultRunAttempt = '1';

/**
 * Default local ref used by local live UX invocations.
 */
const defaultRef = 'local';

/**
 * Stable operator id used by automated Discord UX route replay.
 */
const liveLabOperatorId = 'live-lab-operator';

/**
 * Discord Gateway opcode for dispatch events.
 */
const discordGatewayDispatchOpcode = 0;

/**
 * Discord Gateway interaction event name.
 */
const discordGatewayInteractionCreateEvent = 'INTERACTION_CREATE';

/**
 * DevPlat component custom-id prefix expected in rendered Discord buttons.
 */
const devplatComponentCustomIdPrefix = 'devplat:v1:';

/**
 * Discord component custom_id maximum from the component contract.
 */
const discordComponentCustomIdMaxLength = 100;

/**
 * Relevant path pattern for Discord package interaction behavior.
 */
const discordPackagePathPattern = /^packages\/discord\//u;

/**
 * Relevant path pattern for OpenClaw Discord-facing contracts.
 */
const openclawPackagePathPattern = /^packages\/openclaw\//u;

/**
 * Relevant path pattern for runtime configuration that can affect private workers.
 */
const configPackagePathPattern = /^packages\/config\//u;

/**
 * Relevant path pattern for Helm deployment configuration.
 */
const helmDeployPathPattern = /^deploy\/helm\/devplat\//u;

/**
 * Relevant path pattern for live-lab scripts and their preflight tests.
 */
const liveLabScriptPathPattern =
  /^scripts\/(?:openclaw-live-lab|discord-ux-live-lab|discord-live-lab-harness)(?:\.test)?\.mjs$/u;

/**
 * Relevant path pattern for generated OpenClaw manifest wiring.
 */
const openclawManifestPathPattern =
  /^packages\/openclaw\/openclaw\.plugin\.json$/u;

/**
 * Relevant path pattern for generated Discord and OpenClaw schemas.
 */
const interactionSchemaPathPattern =
  /^packages\/(?:discord|openclaw)\/schemas\//u;

/**
 * Relevant path pattern for operator-facing Discord interaction documentation.
 */
const interactionDocsPathPattern =
  /^site\/guide-docs\/guides\/(?:discord-workflows|live-test-discord-setup|openclaw-setup|operator-guide)\.md$/u;

/**
 * Relevant path pattern for this live UX workflow.
 */
const discordUxWorkflowPathPattern =
  /^\.github\/workflows\/discord-ux-live-lab\.yml$/u;

/**
 * Supported DevPlat component custom-id shape.
 */
const devplatComponentCustomIdPattern = /^devplat:v1:[a-z0-9-]+:[^:]+$/u;

/**
 * Required environment variable names for live Discord UX validation.
 */
const requiredDiscordUxEnvironmentNames = [
  'LIVE_TEST_DISCORD_APPLICATION_ID',
  'LIVE_TEST_DISCORD_BOT_TOKEN',
  'LIVE_TEST_DISCORD_GUILD_ID',
];

/**
 * Relevant path patterns that require live Discord UX validation.
 */
const discordUxRelevantPathPatterns = [
  discordPackagePathPattern,
  openclawPackagePathPattern,
  configPackagePathPattern,
  helmDeployPathPattern,
  liveLabScriptPathPattern,
  openclawManifestPathPattern,
  interactionSchemaPathPattern,
  interactionDocsPathPattern,
  discordUxWorkflowPathPattern,
];

/**
 * Serializes unknown errors for reports.
 */
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

/**
 * Parses repeated CLI flags while preserving repeated changed-file inputs.
 */
function parseDiscordUxFlagArguments(argv) {
  const args = new Map();
  const changedFiles = [];

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

    if (token === '--changed-file') {
      changedFiles.push(next);
    } else {
      args.set(token, next);
    }
    index += 1;
  }

  return {
    args,
    changedFiles,
  };
}

/**
 * Resolves a path-like CLI value from the repository root.
 */
function resolveCliPath(value) {
  return resolve(process.cwd(), value);
}

/**
 * Parses Discord UX live-lab CLI arguments.
 */
export function parseDiscordUxLiveLabArgs(argv) {
  const { args, changedFiles } = parseDiscordUxFlagArguments(argv);
  const reportDir = args.get('--report-dir');

  return {
    baseRef:
      typeof args.get('--base-ref') === 'string'
        ? args.get('--base-ref')
        : undefined,
    changedFiles,
    force: args.get('--force') === true,
    headRef:
      typeof args.get('--head-ref') === 'string'
        ? args.get('--head-ref')
        : undefined,
    ref: typeof args.get('--ref') === 'string' ? args.get('--ref') : undefined,
    reportDir:
      typeof reportDir === 'string' ? resolveCliPath(reportDir) : undefined,
  };
}

/**
 * Reads a required environment value or returns an empty string sentinel.
 */
function readOptionalEnvironmentValue(env, name) {
  const value = env[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Returns missing required live Discord UX environment variable names.
 */
export function createDiscordUxLiveLabEnvironmentIssues(env = process.env) {
  return requiredDiscordUxEnvironmentNames.filter(
    (name) => readOptionalEnvironmentValue(env, name).trim().length === 0,
  );
}

/**
 * Creates the live Discord UX runtime environment from process environment.
 */
export function createDiscordUxLiveLabEnvironment(env = process.env) {
  const issues = createDiscordUxLiveLabEnvironmentIssues(env);
  if (issues.length > 0) {
    throw new Error(
      `Missing required Discord UX live-lab environment values: ${issues.join(', ')}`,
    );
  }

  const runNumber = env['GITHUB_RUN_NUMBER'] ?? defaultRunNumber;
  const runAttempt = env['GITHUB_RUN_ATTEMPT'] ?? defaultRunAttempt;

  return {
    discord: {
      applicationId: readOptionalEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_APPLICATION_ID',
      ),
      baseUrl:
        env['LIVE_TEST_DISCORD_API_BASE_URL'] ?? defaultDiscordApiBaseUrl,
      botToken: readOptionalEnvironmentValue(
        env,
        'LIVE_TEST_DISCORD_BOT_TOKEN',
      ),
      categoryName: env['LIVE_TEST_DISCORD_CATEGORY_NAME'],
      guildId: readOptionalEnvironmentValue(env, 'LIVE_TEST_DISCORD_GUILD_ID'),
    },
    githubWorkflow: {
      eventName: env['GITHUB_EVENT_NAME'] ?? defaultRef,
      ref: env['GITHUB_REF_NAME'] ?? defaultRef,
      runAttempt,
      runNumber,
      sha: env['GITHUB_SHA'] ?? defaultRef,
      stepSummaryPath: env['GITHUB_STEP_SUMMARY'] ?? null,
    },
  };
}

/**
 * Creates workflow metadata without requiring live Discord secrets.
 */
function createDiscordUxWorkflowEnvironment(env = process.env) {
  const runNumber = env['GITHUB_RUN_NUMBER'] ?? defaultRunNumber;
  const runAttempt = env['GITHUB_RUN_ATTEMPT'] ?? defaultRunAttempt;

  return {
    discord: {
      applicationId: '',
      baseUrl:
        env['LIVE_TEST_DISCORD_API_BASE_URL'] ?? defaultDiscordApiBaseUrl,
      botToken: '',
      categoryName: env['LIVE_TEST_DISCORD_CATEGORY_NAME'],
      guildId: '',
    },
    githubWorkflow: {
      eventName: env['GITHUB_EVENT_NAME'] ?? defaultRef,
      ref: env['GITHUB_REF_NAME'] ?? defaultRef,
      runAttempt,
      runNumber,
      sha: env['GITHUB_SHA'] ?? defaultRef,
      stepSummaryPath: env['GITHUB_STEP_SUMMARY'] ?? null,
    },
  };
}

/**
 * Returns true when a changed path requires Discord UX live validation.
 */
function isDiscordUxRelevantPath(path) {
  return discordUxRelevantPathPatterns.some((pattern) => pattern.test(path));
}

/**
 * Decides whether a PR or dispatch must run the live Discord UX suite.
 */
export function createDiscordUxScopeDecision({
  changedFiles = [],
  eventName = defaultRef,
  force = false,
}) {
  const normalizedFiles = changedFiles
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  const relevantFiles = normalizedFiles.filter(isDiscordUxRelevantPath);

  if (force || eventName === 'workflow_dispatch') {
    return {
      runRequired: true,
      changedFiles: normalizedFiles,
      relevantFiles,
      reason: 'Discord UX live validation was explicitly requested.',
    };
  }

  if (normalizedFiles.length === 0) {
    return {
      runRequired: true,
      changedFiles: normalizedFiles,
      relevantFiles,
      reason:
        'Changed files were unavailable, so Discord UX live validation is required.',
    };
  }

  if (relevantFiles.length === 0) {
    return {
      runRequired: false,
      changedFiles: normalizedFiles,
      relevantFiles,
      skipReason: 'No Discord UX relevant files changed.',
    };
  }

  return {
    runRequired: true,
    changedFiles: normalizedFiles,
    relevantFiles,
    reason: 'Discord UX relevant files changed.',
  };
}

/**
 * Reads changed files from git for PR scope decisions.
 */
async function readChangedFilesFromGit({ baseRef, headRef }) {
  if (baseRef === undefined || headRef === undefined) {
    return [];
  }

  const { stdout } = await execFileAsync('git', [
    'diff',
    '--name-only',
    `${baseRef}...${headRef}`,
  ]);

  return stdout
    .split('\n')
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

/**
 * Creates the stable run label used in Discord threads and reports.
 */
function createDiscordUxRunLabel(environment) {
  return `${environment.githubWorkflow.runNumber}-${environment.githubWorkflow.runAttempt}`;
}

/**
 * Sanitizes a segment used in live Discord thread names.
 */
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

/**
 * Asserts the Discord command registration response covers every expected command.
 */
export function assertDiscordUxCommandRegistration(registration) {
  const returnedNames = Array.isArray(registration.responseBody)
    ? registration.responseBody.flatMap((command) =>
        typeof command?.name === 'string' ? [command.name] : [],
      )
    : [];
  const missingNames = registration.names.filter(
    (name) => !returnedNames.includes(name),
  );

  if (missingNames.length > 0) {
    throw new Error(
      `Discord command registration did not return expected commands: ${missingNames.join(', ')}`,
    );
  }

  return {
    count: registration.count,
    endpoint: registration.endpoint,
    names: registration.names,
    returnedNames,
  };
}

/**
 * Reads the channel id Discord returned for a fetched message.
 */
function readFetchedMessageChannelId(message) {
  const channelId = message?.channel_id;
  return typeof channelId === 'string' ? channelId : null;
}

/**
 * Reads the content Discord returned for a fetched message.
 */
function readFetchedMessageContent(message) {
  const content = message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Asserts fetched Discord component custom ids are well-formed.
 */
function assertFetchedMessageCustomIds(customIds) {
  if (customIds.length === 0) {
    throw new Error(
      'Fetched Discord UX message did not include actionable components.',
    );
  }

  if (new Set(customIds).size !== customIds.length) {
    throw new Error(
      'Fetched Discord UX message contained duplicate component custom ids.',
    );
  }

  if (
    customIds.some(
      (customId) => customId.length > discordComponentCustomIdMaxLength,
    )
  ) {
    throw new Error(
      'Fetched Discord UX message contained overlong component custom ids.',
    );
  }

  if (
    customIds.some(
      (customId) =>
        !customId.startsWith(devplatComponentCustomIdPrefix) ||
        !devplatComponentCustomIdPattern.test(customId),
    )
  ) {
    throw new Error(
      'Fetched Discord UX message contained malformed component custom ids.',
    );
  }
}

/**
 * Returns true when a posted message payload suppresses accidental mentions.
 */
function hasRestrictedAllowedMentions(payload) {
  return (
    Array.isArray(payload?.allowed_mentions?.parse) &&
    payload.allowed_mentions.parse.length === 0
  );
}

/**
 * Collects fetched Discord button metadata for UX assertions and reporting.
 */
function collectDiscordButtonMetadata(payload) {
  if (!Array.isArray(payload?.components)) {
    return [];
  }

  return payload.components.flatMap((row, rowIndex) => {
    if (!Array.isArray(row?.components)) {
      return [];
    }

    return row.components.map((component, componentIndex) => ({
      componentIndex,
      customId:
        typeof component?.[discordComponentCustomIdField] === 'string'
          ? component[discordComponentCustomIdField]
          : null,
      label: typeof component?.label === 'string' ? component.label : null,
      rowIndex,
      style: typeof component?.style === 'number' ? component.style : null,
      type: typeof component?.type === 'number' ? component.type : null,
    }));
  });
}

/**
 * Asserts fetched button metadata still reflects rendered operator controls.
 */
function assertFetchedMessageButtonMetadata(buttonComponents) {
  if (
    buttonComponents.some(
      (component) =>
        component.customId === null ||
        component.label === null ||
        component.label.trim().length === 0 ||
        component.style === null ||
        component.type !== 2,
    )
  ) {
    throw new Error(
      'Fetched Discord UX message contained incomplete button metadata.',
    );
  }
}

/**
 * Asserts a fetched Discord message still contains rendered operator UX.
 */
export function assertDiscordUxFetchedMessage({ fetchedMessage, receipt }) {
  if (fetchedMessage === undefined || fetchedMessage === null) {
    throw new Error('Fetched Discord UX message was missing.');
  }

  if (fetchedMessage.id !== receipt.messageId) {
    throw new Error('Fetched Discord UX message id did not match the receipt.');
  }

  if (readFetchedMessageChannelId(fetchedMessage) !== receipt.channelId) {
    throw new Error(
      'Fetched Discord UX message channel did not match the receipt.',
    );
  }

  if (
    receipt.body !== undefined &&
    !hasRestrictedAllowedMentions(receipt.body)
  ) {
    throw new Error(
      'Posted Discord UX message allowed mentions were not restricted.',
    );
  }

  const content = readFetchedMessageContent(fetchedMessage);
  if (content.trim().length === 0) {
    throw new Error(
      'Fetched Discord UX message did not include operator-visible content.',
    );
  }

  if (!Array.isArray(fetchedMessage.components)) {
    throw new Error(
      'Fetched Discord UX message did not include rendered components.',
    );
  }

  const componentCustomIds = collectDiscordComponentCustomIds(fetchedMessage);
  assertFetchedMessageCustomIds(componentCustomIds);
  const buttonComponents = collectDiscordButtonMetadata(fetchedMessage);
  assertFetchedMessageButtonMetadata(buttonComponents);

  return {
    buttonComponents,
    channelId: receipt.channelId,
    componentCustomIds,
    componentRows: fetchedMessage.components.length,
    content,
    fetchedMessage: {
      allowedMentions: fetchedMessage.allowed_mentions ?? null,
      channelId: readFetchedMessageChannelId(fetchedMessage),
      components: fetchedMessage.components,
      content,
      id: fetchedMessage.id,
    },
    messageId: receipt.messageId,
  };
}

/**
 * Asserts a Gateway route replay reached the expected bound Discord thread.
 */
export function assertDiscordUxRouteReplayResult({
  expectedThreadId,
  label,
  result,
}) {
  if (result.status !== 'handled') {
    throw new Error(`Discord UX ${label} replay was not handled.`);
  }

  if (
    result.threadId !== expectedThreadId ||
    result.controlResult?.request?.threadId !== expectedThreadId
  ) {
    throw new Error(`Discord UX ${label} replay resolved the wrong thread.`);
  }

  if (
    result.controlResult.allowed !== true ||
    result.controlResult.failedClosed === true
  ) {
    throw new Error(`Discord UX ${label} replay failed closed.`);
  }

  const messageId = readDiscordReceiptMessageId(
    result.controlResult.threadReceipt,
  );
  if (messageId === null) {
    throw new Error(`Discord UX ${label} replay did not record a message id.`);
  }

  return {
    action: result.controlResult.request.action,
    interactionId: result.interactionId,
    label,
    messageId,
    threadId: expectedThreadId,
  };
}

/**
 * Builds a Gateway dispatch event for a slash-command-shaped interaction.
 */
function createSlashCommandDispatchEvent({ channelId, runLabel }) {
  return {
    op: discordGatewayDispatchOpcode,
    t: discordGatewayInteractionCreateEvent,
    s: 1,
    d: {
      id: `discord-ux-${runLabel}-slash`,
      token: `discord-ux-token-${runLabel}-slash`,
      channel_id: channelId,
      data: {
        name: 'retry-gates',
      },
      member: {
        user: {
          id: liveLabOperatorId,
        },
      },
    },
  };
}

/**
 * Builds a Gateway dispatch event for a button-shaped interaction.
 */
function createButtonDispatchEvent({ channelId, customId, runLabel }) {
  return {
    op: discordGatewayDispatchOpcode,
    t: discordGatewayInteractionCreateEvent,
    s: 2,
    d: {
      id: `discord-ux-${runLabel}-button`,
      token: `discord-ux-token-${runLabel}-button`,
      channel_id: channelId,
      data: {
        [discordComponentCustomIdField]: customId,
      },
      member: {
        user: {
          id: liveLabOperatorId,
        },
      },
    },
  };
}

/**
 * Fetches a Discord message from the live sandbox guild.
 */
async function fetchDiscordMessage({ channelId, discordRequest, messageId }) {
  return discordRequest(
    `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
  );
}

/**
 * Converts a route receipt into a fetched-message report.
 */
async function createFetchedMessageReport({
  channelId,
  discordRequest,
  receipt,
}) {
  const messageId = readDiscordReceiptMessageId(receipt);
  if (messageId === null) {
    throw new Error('Discord UX route replay did not record a message id.');
  }

  const baseReceipt = {
    ...createDiscordMessageReceiptReport({
      channelId,
      receipt,
    }),
    messageId,
  };
  const fetchedMessage = await fetchDiscordMessage({
    channelId,
    discordRequest,
    messageId,
  });

  return assertDiscordUxFetchedMessage({
    fetchedMessage,
    receipt: baseReceipt,
  });
}

/**
 * Creates the production Gateway service used by live route replay.
 */
async function createDiscordUxGatewayService({ reportDirectory, transport }) {
  const discordEntrypoint = await resolveWorkspacePackageEntrypoint('discord');
  const storageEntrypoint = await resolveWorkspacePackageEntrypoint('storage');
  const discordModule = await import(pathToFileURL(discordEntrypoint).href);
  const storageModule = await import(pathToFileURL(storageEntrypoint).href);
  const store = new storageModule.FileStoreService(
    resolve(reportDirectory, 'deep-test', 'devplat-state'),
  );
  const controlPlane = new discordModule.DiscordControlPlaneService(
    undefined,
    undefined,
    store,
    transport,
  );

  return new discordModule.DiscordInteractionGatewayService(
    controlPlane,
    discordModule.createStorageBackedDiscordGatewayBindingResolver(store),
  );
}

/**
 * Writes JSON to a report path with a trailing newline.
 */
async function writeJsonReport(path, payload) {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/**
 * Runs the supported Discord UX interaction replay probe.
 */
export async function runDiscordUxInteractionProbe(
  {
    discordChannels,
    discordRequest,
    reportDirectory,
    runLabel,
    updatedAt = new Date().toISOString(),
  },
  dependencies = {},
) {
  await mkdir(reportDirectory, { recursive: true });
  const serviceFactory =
    dependencies.createDiscordGatewayService ?? createDiscordUxGatewayService;
  const persistGatewayBoundSession =
    dependencies.persistDiscordGatewayBoundSession ??
    persistDiscordGatewayBoundSession;
  const thread = await createLiveLabImplementationThread({
    discordChannels,
    discordRequest,
    runLabel,
    sanitizeSegment,
  });
  const threadId = thread.id;
  const boundSession = {
    id: `discord-ux-${runLabel}-session`,
    summary: 'Discord UX live-lab implementation thread',
    status: 'running',
    trace: [],
    updatedAt,
    guildId: 'live-lab-guild',
    channelId: threadId,
    parentChannelId: thread.parentChannelId,
    threadId,
    kind: 'implementation',
    specId: `discord-ux-${runLabel}-spec`,
    sliceId: `discord-ux-${runLabel}-slice`,
    pullRequestNumber: null,
    artifactId: `discord-ux-${runLabel}-artifact`,
  };
  const transport = new LiveLabDiscordInteractionTransport({
    auditChannelId: discordChannels.audit.id,
    discordRequest,
  });

  await persistGatewayBoundSession({
    boundSession,
    reportDirectory,
  });

  const service = await serviceFactory({
    discordRequest,
    reportDirectory,
    transport,
  });
  const slashResult = await service.handleDispatch(
    createSlashCommandDispatchEvent({
      channelId: threadId,
      runLabel,
    }),
  );
  const slashReplay = assertDiscordUxRouteReplayResult({
    expectedThreadId: threadId,
    label: 'slash',
    result: slashResult,
  });
  const slashMessage = await createFetchedMessageReport({
    channelId: threadId,
    discordRequest,
    receipt: slashResult.controlResult.threadReceipt,
  });
  const [buttonCustomId] = slashMessage.componentCustomIds;
  const buttonResult = await service.handleDispatch(
    createButtonDispatchEvent({
      channelId: threadId,
      customId: buttonCustomId,
      runLabel,
    }),
  );
  const buttonReplay = assertDiscordUxRouteReplayResult({
    expectedThreadId: threadId,
    label: 'button',
    result: buttonResult,
  });
  const buttonMessage = await createFetchedMessageReport({
    channelId: threadId,
    discordRequest,
    receipt: buttonResult.controlResult.threadReceipt,
  });
  const report = {
    thread,
    messages: {
      slash: slashMessage,
      button: buttonMessage,
    },
    routeReplays: [slashReplay, buttonReplay],
  };

  await writeJsonReport(
    resolve(reportDirectory, discordUxInteractionProbeReportFileName),
    report,
  );

  return report;
}

/**
 * Creates the default live-lab report directory.
 */
function createDefaultReportDirectory(runLabel) {
  return resolve(tmpdir(), `devplat-discord-ux-live-lab-${runLabel}`);
}

/**
 * Appends a GitHub step summary when the workflow environment provides one.
 */
async function appendStepSummary(summaryPath, report) {
  if (summaryPath === null) {
    return;
  }

  const lines = [
    '# Discord UX Live Lab',
    '',
    `- Status: ${report.status}`,
    `- Ref: ${report.ref ?? 'n/a'}`,
    `- Run: ${report.runLabel}`,
    `- Discord category: ${report.discord?.category?.name ?? 'n/a'}`,
    `- Relevant files: ${String(report.scope?.relevantFiles?.length ?? 0)}`,
  ];

  if (report.error !== null) {
    lines.push(`- Failure: ${report.error.message}`);
  }

  await writeFile(summaryPath, `${lines.join('\n')}\n`, {
    encoding: 'utf8',
    flag: 'a',
  });
}

/**
 * Runs the top-level Discord UX live-lab workflow.
 */
export async function runDiscordUxLiveLab(options, dependencies = {}) {
  const environment =
    options.environment ?? createDiscordUxLiveLabEnvironment(process.env);
  const runLabel = createDiscordUxRunLabel(environment);
  const reportDirectory =
    options.reportDir ?? createDefaultReportDirectory(runLabel);
  const scope =
    options.scopeDecision ??
    createDiscordUxScopeDecision({
      changedFiles: options.changedFiles,
      eventName: environment.githubWorkflow.eventName,
      force: options.force,
    });
  const report = {
    status: scope.runRequired ? 'running' : 'skipped',
    runLabel,
    ref: options.ref ?? environment.githubWorkflow.ref,
    discord: null,
    commands: null,
    thread: null,
    messages: null,
    routeReplays: [],
    error: null,
    scope,
  };
  const reportPath = resolve(reportDirectory, discordUxLiveLabReportFileName);
  await mkdir(reportDirectory, { recursive: true });

  if (!scope.runRequired) {
    report.completedAt = new Date().toISOString();
    await writeJsonReport(reportPath, report);
    await appendStepSummary(environment.githubWorkflow.stepSummaryPath, report);
    return report;
  }

  try {
    const discordRequest =
      dependencies.discordRequest ??
      createDiscordRequest({
        baseUrl: environment.discord.baseUrl,
        botToken: environment.discord.botToken,
        fetchImpl: dependencies.fetchImpl,
      });
    const ensureDiscordChannelsFn =
      dependencies.ensureDiscordChannels ?? ensureDiscordChannels;
    const registerDiscordApplicationCommandsFn =
      dependencies.registerDiscordApplicationCommands ??
      registerDiscordApplicationCommands;
    const runDiscordUxInteractionProbeFn =
      dependencies.runDiscordUxInteractionProbe ?? runDiscordUxInteractionProbe;

    await getGuild(environment.discord.guildId, discordRequest);
    const discordChannels = await ensureDiscordChannelsFn({
      categoryName: environment.discord.categoryName ?? testDiscordCategoryName,
      discordRequest,
      guildId: environment.discord.guildId,
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

    const commandRegistration = await registerDiscordApplicationCommandsFn({
      applicationId: environment.discord.applicationId,
      discordRequest,
      guildId: environment.discord.guildId,
    });
    report.commands = assertDiscordUxCommandRegistration(commandRegistration);

    const probe = await runDiscordUxInteractionProbeFn({
      discordChannels: discordChannels.channels,
      discordRequest,
      reportDirectory,
      runLabel,
    });
    report.thread = probe.thread;
    report.messages = probe.messages;
    report.routeReplays = probe.routeReplays;
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = serializeError(error);
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    await writeJsonReport(reportPath, report);
    await appendStepSummary(environment.githubWorkflow.stepSummaryPath, report);
  }

  return report;
}

/**
 * Resolves changed files for the CLI invocation.
 */
async function resolveChangedFiles(args) {
  if (args.changedFiles.length > 0) {
    return args.changedFiles;
  }

  return readChangedFilesFromGit({
    baseRef: args.baseRef,
    headRef: args.headRef,
  });
}

/**
 * CLI entrypoint for Discord UX live-lab validation.
 */
export async function main(
  argv = process.argv.slice(2),
  {
    createEnvironment = createDiscordUxLiveLabEnvironment,
    resolveChangedFilesFn = resolveChangedFiles,
    runDiscordUxLiveLabFn = runDiscordUxLiveLab,
    writeOutput = (content) => {
      process.stdout.write(content);
    },
  } = {},
) {
  const args = parseDiscordUxLiveLabArgs(argv);
  const changedFiles = await resolveChangedFilesFn(args);
  const workflowEnvironment = createDiscordUxWorkflowEnvironment();
  const scopeDecision = createDiscordUxScopeDecision({
    changedFiles,
    eventName: workflowEnvironment.githubWorkflow.eventName,
    force: args.force,
  });
  const environment = scopeDecision.runRequired
    ? createEnvironment()
    : workflowEnvironment;
  const report = await runDiscordUxLiveLabFn({
    ...args,
    changedFiles,
    environment,
    scopeDecision,
  });

  writeOutput(
    `${JSON.stringify(
      {
        completedAt: report.completedAt,
        reportDirectory:
          args.reportDir ?? createDefaultReportDirectory(report.runLabel),
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
