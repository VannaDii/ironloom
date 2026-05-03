import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRootDirectory = resolve(import.meta.dirname, '..');
const defaultGatewayPort = 18789;
const defaultReadinessTimeoutMs = 60_000;
const defaultReadinessPollMs = 1_000;
const defaultImageTagPrefix = 'devplat-openclaw-deep-test';
const fixedTimestamp = '2026-04-04T00:00:00.000Z';
const redactedValue = '[redacted]';
/**
 * Characters ignored while classifying snapshot keys for secret redaction.
 */
const snapshotKeyIgnoredCharacterPattern = /[^a-z0-9]/giu;
/**
 * Worktree root used by the hermetic scenario and mirrored into the runtime.
 */
const defaultWorktreeRoot = 'devplat-state/worktrees';
/**
 * Runtime path where the host-backed DevPlat state store is mounted.
 */
const containerDevplatStateDirectory = '/app/.devplat';
/**
 * Permission mode that lets the host runner write files after container-owned state writes.
 */
const hostWritablePermissionMode = 'u+rwX,go-rwx';
/**
 * Host user id that should own container-created bind-mount children after cleanup normalization.
 */
const hostRunnerUid = String(process.getuid());
/**
 * Host group id that should own container-created bind-mount children after cleanup normalization.
 */
const hostRunnerGid = String(process.getgid());
/**
 * Shell snippet that updates container-owned children without touching the host-owned mount root.
 */
const hostWritableMountChildrenCommand =
  'find "$1" -mindepth 1 -exec chown "$2:$3" {} \\; -exec chmod "$4" {} \\;';
/**
 * Warning code recorded when mounted state permission normalization fails.
 */
const mountedStatePermissionWarningCode =
  'mounted-state-permission-normalization-failed';
/**
 * Operator-facing warning when mounted state may remain container-owned.
 */
const mountedStatePermissionWarningMessage =
  'Container-created .devplat entries may remain owned by the runtime user.';

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

export function parseDeepTestArgs(argv) {
  const args = parseFlagArguments(argv);
  const mode = args.get('--mode') ?? 'hermetic';
  if (mode !== 'hermetic' && mode !== 'live') {
    throw new Error('--mode must be hermetic or live.');
  }

  const image = args.get('--image');
  const skipBuild = args.get('--skip-build') === true;
  if (skipBuild && typeof image !== 'string') {
    throw new Error('--skip-build requires --image.');
  }

  return {
    mode,
    image: typeof image === 'string' ? image : undefined,
    reportDir:
      typeof args.get('--report-dir') === 'string'
        ? resolve(repoRootDirectory, args.get('--report-dir'))
        : undefined,
    retainImage: args.get('--retain-image') === true,
    retainContainerOnFailure:
      args.get('--retain-container-on-failure') === true,
    skipBuild,
  };
}

function sanitizeNameSegment(value) {
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

  while (normalized.startsWith('-') || normalized.startsWith('.')) {
    normalized = normalized.slice(1);
  }

  while (normalized.endsWith('-')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function createScopedRuntimeName(reportDirectory) {
  const resolvedReportDirectory = resolve(reportDirectory);
  const reportSegment = sanitizeNameSegment(
    `${basename(resolve(resolvedReportDirectory, '..'))}-${basename(
      resolvedReportDirectory,
    )}`,
  );
  const digest = createHash('sha256')
    .update(resolvedReportDirectory)
    .digest('hex')
    .slice(0, 12);

  return reportSegment.length > 0 ? `${reportSegment}-${digest}` : digest;
}

function createStep(tool, params, expected, phase) {
  return { tool, params, expected, phase };
}

function isSensitiveKey(key) {
  const normalized = key
    .replace(snapshotKeyIgnoredCharacterPattern, '')
    .toLowerCase();

  return (
    normalized === 'publickey' ||
    normalized === 'privatekey' ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password') ||
    normalized.endsWith('apikey')
  );
}

export function sanitizeSnapshotForArtifacts(snapshot) {
  if (Array.isArray(snapshot)) {
    return snapshot.map((value) => sanitizeSnapshotForArtifacts(value));
  }

  if (typeof snapshot !== 'object' || snapshot === null) {
    return snapshot;
  }

  return Object.fromEntries(
    Object.entries(snapshot).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? redactedValue : sanitizeSnapshotForArtifacts(value),
    ]),
  );
}

export function createRuntimeEnv(overrides = {}) {
  return {
    GITHUB_OWNER: 'VannaDii',
    GITHUB_REPO: 'devplat',
    DEVPLAT_WORKTREE_ROOT: defaultWorktreeRoot,
    DISCORD_API_BASE_URL: 'https://discord.com/api/v10',
    DISCORD_APPLICATION_ID: 'application-1',
    DISCORD_CATEGORY_NAME: 'test',
    DISCORD_PUBLIC_KEY: 'public-key-1',
    DISCORD_BOT_TOKEN: 'bot-token-1',
    DISCORD_GATEWAY_URL: 'wss://gateway.discord.gg/?v=10&encoding=json',
    DISCORD_GATEWAY_INTENTS: '0',
    DISCORD_DEFAULT_GUILD_ID: 'guild-1',
    DISCORD_SPEC_CHANNEL_ID: 'spec-1',
    DISCORD_IMPLEMENTATION_CHANNEL_ID: 'impl-1',
    DISCORD_PULL_REQUEST_CHANNEL_ID: 'pr-1',
    DISCORD_AUDIT_CHANNEL_ID: 'audit-1',
    DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID: 'pm-1',
    OPENCLAW_PLUGIN_ID: '@vannadii/devplat-openclaw',
    SONAR_ORGANIZATION: 'vannadii',
    SONAR_PROJECT_KEY: 'vannadii_devplat',
    ...overrides,
  };
}

export function createPluginConfig(runtimeEnv) {
  return {
    id: '@vannadii/devplat-openclaw:config',
    summary: `OpenClaw configuration for ${runtimeEnv.GITHUB_OWNER}/${runtimeEnv.GITHUB_REPO}`,
    status: 'approved',
    trace: ['config:resolved'],
    updatedAt: fixedTimestamp,
    apiBaseUrl: runtimeEnv.DISCORD_API_BASE_URL,
    apiVersion: 'v10',
    applicationId: runtimeEnv.DISCORD_APPLICATION_ID,
    categoryName: runtimeEnv.DISCORD_CATEGORY_NAME,
    publicKey: runtimeEnv.DISCORD_PUBLIC_KEY,
    botToken: runtimeEnv.DISCORD_BOT_TOKEN,
    installScopes: ['bot', 'applications.commands'],
    requiredPermissions: [
      'ViewChannel',
      'SendMessages',
      'CreatePublicThreads',
      'CreatePrivateThreads',
      'SendMessagesInThreads',
      'ManageThreads',
      'ReadMessageHistory',
    ],
    defaultGuildId: runtimeEnv.DISCORD_DEFAULT_GUILD_ID,
    specChannelId: runtimeEnv.DISCORD_SPEC_CHANNEL_ID,
    implementationChannelId: runtimeEnv.DISCORD_IMPLEMENTATION_CHANNEL_ID,
    pullRequestChannelId: runtimeEnv.DISCORD_PULL_REQUEST_CHANNEL_ID,
    auditChannelId: runtimeEnv.DISCORD_AUDIT_CHANNEL_ID,
    projectManagementChannelId:
      runtimeEnv.DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID,
    threadBindingMode: 'inherit-parent',
    actionGates: {
      approveThis: true,
      mergeNow: false,
      retryGates: true,
      rebaseAllDependents: true,
    },
  };
}

export function createGatewayConfig({
  gatewayToken,
  pluginConfig,
  workspaceDirectory = '/state/workspace',
}) {
  return {
    gateway: {
      mode: 'local',
      bind: 'loopback',
      port: defaultGatewayPort,
      auth: {
        mode: 'token',
        token: gatewayToken,
      },
    },
    agents: {
      defaults: {
        workspace: workspaceDirectory,
      },
    },
    plugins: {
      enabled: true,
      load: {
        paths: ['/app/packages/openclaw'],
      },
      entries: {
        '@vannadii/devplat-openclaw': {
          enabled: true,
          config: pluginConfig,
        },
      },
    },
  };
}

export function buildDockerBuildArgs(imageTag) {
  return [
    'build',
    '-t',
    imageTag,
    '-f',
    'docker/openclaw-runtime/Dockerfile',
    '.',
  ];
}

export function buildDockerRunArgs({
  bundledExtensionsDirectory,
  containerName,
  devplatStateDirectory,
  imageTag,
  mode,
  runtimeEnv = {},
  runtimeDirectory,
}) {
  const runtimeEnvArgs = Object.keys(runtimeEnv)
    .sort()
    .flatMap((key) => ['-e', key]);
  const args = [
    'run',
    '-d',
    '--name',
    containerName,
    '-e',
    'OPENCLAW_STATE_DIR=/state',
    '-e',
    'OPENCLAW_CONFIG_PATH=/state/openclaw.json',
    '-e',
    `DEVPLAT_STORAGE_ROOT=${containerDevplatStateDirectory}`,
    '-e',
    'HOME=/state/home',
    '-e',
    'OPENCLAW_HOME=/state/openclaw-home',
    '-e',
    'OPENCLAW_NO_RESPAWN=1',
    '-e',
    'TMPDIR=/state/tmp',
    '-e',
    `DEVPLAT_TEST_MODE=${mode}`,
    ...runtimeEnvArgs,
    '-v',
    `${runtimeDirectory}:/state`,
    '-v',
    `${devplatStateDirectory}:${containerDevplatStateDirectory}`,
    '-v',
    `${bundledExtensionsDirectory}:/app/node_modules/openclaw/dist/extensions:ro`,
  ];

  if (mode === 'hermetic') {
    args.push('--network', 'none');
  }

  if (mode === 'live') {
    args.push('-e', 'DISCORD_GATEWAY_ENABLED=true');
  }

  args.push(
    imageTag,
    '--port',
    String(defaultGatewayPort),
    '--bind',
    'loopback',
    '--allow-unconfigured',
  );

  return args;
}

export function createInvokeRequest(tool, params) {
  return {
    tool,
    args: params,
  };
}

export function createInvokeScript({ gatewayToken, request }) {
  const encodedBody = Buffer.from(JSON.stringify(request), 'utf8').toString(
    'base64',
  );
  const encodedToken = Buffer.from(gatewayToken, 'utf8').toString('base64');

  return `
(async () => {
const body = JSON.parse(Buffer.from(${JSON.stringify(encodedBody)}, 'base64').toString('utf8'));
const token = Buffer.from(${JSON.stringify(encodedToken)}, 'base64').toString('utf8');
const response = await fetch('http://127.0.0.1:${String(defaultGatewayPort)}/tools/invoke', {
  method: 'POST',
  headers: {
    'authorization': 'Bearer ' + token,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});
const text = await response.text();
let parsedBody = null;
if (text.length > 0) {
  parsedBody = JSON.parse(text);
}
process.stdout.write(JSON.stringify({ status: response.status, body: parsedBody }));
})().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
`;
}

export function assertPartialMatch(expected, actual, path = 'result.details') {
  if (expected === undefined) {
    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      throw new Error(
        `${path} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
      );
    }

    for (const [index, value] of expected.entries()) {
      assertPartialMatch(value, actual[index], `${path}[${String(index)}]`);
    }

    return;
  }

  if (typeof expected !== 'object' || expected === null) {
    if (expected !== actual) {
      throw new Error(
        `${path} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
      );
    }

    return;
  }

  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
    throw new Error(`${path} mismatch: expected object.`);
  }

  for (const [key, value] of Object.entries(expected)) {
    assertPartialMatch(value, actual[key], `${path}.${key}`);
  }
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

async function runCommand(command, args, options = {}) {
  const { cwd = repoRootDirectory, env, input } = options;
  const result = await execFileAsync(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    input,
    maxBuffer: 32 * 1024 * 1024,
  });

  return {
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function ensureWritableDirectory(directory) {
  await mkdir(directory, { recursive: true });
  await chmod(directory, 0o777);
}

/**
 * Makes container-created `.devplat` bind-mount content writable from the host.
 */
async function ensureMountedStateWritable({ commandRunner, containerName }) {
  try {
    await commandRunner('docker', [
      'exec',
      containerName,
      'sh',
      '-c',
      hostWritableMountChildrenCommand,
      'sh',
      containerDevplatStateDirectory,
      hostRunnerUid,
      hostRunnerGid,
      hostWritablePermissionMode,
    ]);
    return undefined;
  } catch (error) {
    return {
      cause: serializeError(error),
      code: mountedStatePermissionWarningCode,
      message: mountedStatePermissionWarningMessage,
    };
  }
}

async function collectStoredKeys(rootDirectory) {
  const scopes = ['artifacts', 'memory', 'state', 'telemetry'];
  const result = {};

  for (const scope of scopes) {
    const scopeDirectory = resolve(rootDirectory, scope);
    const entries = await readdir(scopeDirectory, {
      withFileTypes: true,
    }).catch(() => []);
    result[scope] = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(/\.json$/u, ''))
      .sort((left, right) => left.localeCompare(right));
  }

  return result;
}

/**
 * Records an optional warning on a deep-test report.
 */
function appendDeepTestWarning(report, warning) {
  if (warning !== undefined) {
    report.warnings.push(warning);
  }
}

function createBasePullRequestRecord() {
  return {
    prNumber: 42,
    branchName: 'feature/discord-tools',
    baseBranch: 'main',
    title: 'Expand OpenClaw tools',
    labels: ['automation'],
    reviewState: 'approved',
    mergeReady: true,
    updatedAt: fixedTimestamp,
  };
}

/**
 * Resolves the runtime worktree root used by OpenClaw tool expectations.
 */
function resolveRuntimeWorktreeRoot(runtimeEnv) {
  const configuredWorktreeRoot = runtimeEnv.DEVPLAT_WORKTREE_ROOT?.trim();

  return configuredWorktreeRoot === undefined ||
    configuredWorktreeRoot.length === 0
    ? defaultWorktreeRoot
    : configuredWorktreeRoot;
}

/**
 * Creates the worktree allocation fixture used by sync and release steps.
 */
function createBaseWorktreeAllocation(runtimeEnv = createRuntimeEnv()) {
  const worktreeRoot = resolveRuntimeWorktreeRoot(runtimeEnv);

  return {
    id: 'worktree-task-1',
    summary: 'allocated worktree',
    status: 'approved',
    trace: [],
    updatedAt: fixedTimestamp,
    taskId: 'task-1',
    branchName: 'feature/task-1',
    worktreePath: `${worktreeRoot}/feature/task-1`,
  };
}

/**
 * Creates the queued task record used to verify durable task transitions.
 */
function createQueuedTaskRecord() {
  return {
    id: 'queue-openclaw-1',
    summary: 'Queue a Discord implementation slice',
    status: 'queued',
    trace: ['queue:task-1:queued'],
    updatedAt: fixedTimestamp,
    taskId: 'task-1',
    sliceId: 'slice-1',
    threadId: 'thread-1',
    transitions: [
      {
        toStatus: 'queued',
        action: 'create',
        reason: 'Created task task-1',
        occurredAt: fixedTimestamp,
      },
    ],
  };
}

/**
 * Creates the claimed task record used to verify status updates preserve history.
 */
function createClaimedTaskRecord() {
  return {
    ...createQueuedTaskRecord(),
    status: 'claimed',
    assigneeId: 'worker-1',
    trace: ['queue:task-1:queued', 'queue:task-1:claimed'],
    transitions: [
      {
        toStatus: 'queued',
        action: 'create',
        reason: 'Created task task-1',
        occurredAt: fixedTimestamp,
      },
      {
        fromStatus: 'queued',
        toStatus: 'claimed',
        action: 'claim',
        actorId: 'worker-1',
        reason: 'Claimed task task-1',
        occurredAt: fixedTimestamp,
      },
    ],
  };
}

function createApprovalArtifact() {
  return {
    id: 'artifact-approval-1',
    artifactType: 'approval-record',
    version: 1,
    summary: ' Approve slice ',
    status: 'approved',
    trace: [],
    updatedAt: fixedTimestamp,
    payload: {
      approvalId: ' approval-1 ',
      subjectType: 'slice',
      subjectId: ' slice-1 ',
      actorId: ' operator-1 ',
      decision: 'approved',
      rationale: ' Ready to proceed ',
    },
  };
}

export function createDeepScenario(runtimeEnv) {
  const runtimeConfigInput = { env: runtimeEnv };
  const pluginConfigInput = {
    id: 'devplat-config',
    summary: 'Runtime config',
    status: 'approved',
    trace: ['config:resolved'],
    updatedAt: fixedTimestamp,
    githubOwner: runtimeEnv.GITHUB_OWNER,
    githubRepo: runtimeEnv.GITHUB_REPO,
    repository: {
      owner: runtimeEnv.GITHUB_OWNER,
      repo: runtimeEnv.GITHUB_REPO,
      defaultBranch: 'main',
      repositoryKey: `${runtimeEnv.GITHUB_OWNER}/${runtimeEnv.GITHUB_REPO}`,
    },
    storage: {
      rootDirectory: 'devplat-state',
      layoutVersion: 1,
      artifactDirectory: 'devplat-state/artifacts',
      indexDirectory: 'devplat-state/indexes',
      auditLogDirectory: 'devplat-state/audit',
    },
    worktrees: {
      rootDirectory: resolveRuntimeWorktreeRoot(runtimeEnv),
      baseBranch: 'main',
      syncStrategy: 'rebase-or-fast-forward',
    },
    github: {
      apiBaseUrl: 'https://api.github.com',
      webBaseUrl: 'https://github.com',
      tokenEnvironmentVariable: 'GITHUB_TOKEN',
    },
    deployment: {
      target: 'local-docker',
      dockerImageRepository: 'ghcr.io/vannadii/devplat-openclaw-runtime',
      dockerImageTag: 'latest',
      helmReleaseName: 'devplat',
      helmNamespace: 'devplat',
      helmChartPath: 'deploy/helm/devplat',
      stateMountPath: '/var/lib/devplat',
    },
    discord: {
      apiBaseUrl: runtimeEnv.DISCORD_API_BASE_URL,
      apiVersion: 'v10',
      applicationId: runtimeEnv.DISCORD_APPLICATION_ID,
      categoryName: runtimeEnv.DISCORD_CATEGORY_NAME,
      publicKey: '[redacted]',
      botToken: '[redacted]',
      installScopes: ['bot', 'applications.commands'],
      requiredPermissions: [
        'ViewChannel',
        'SendMessages',
        'CreatePublicThreads',
        'CreatePrivateThreads',
        'SendMessagesInThreads',
        'ManageThreads',
        'ReadMessageHistory',
      ],
      defaultGuildId: runtimeEnv.DISCORD_DEFAULT_GUILD_ID,
      specChannelId: runtimeEnv.DISCORD_SPEC_CHANNEL_ID,
      implementationChannelId: runtimeEnv.DISCORD_IMPLEMENTATION_CHANNEL_ID,
      pullRequestChannelId: runtimeEnv.DISCORD_PULL_REQUEST_CHANNEL_ID,
      auditChannelId: runtimeEnv.DISCORD_AUDIT_CHANNEL_ID,
      projectManagementChannelId:
        runtimeEnv.DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID,
      threadBindingMode: 'inherit-parent',
      interactionTransport: 'gateway',
      gatewayUrl: runtimeEnv.DISCORD_GATEWAY_URL,
      gatewayIntents: Number.parseInt(runtimeEnv.DISCORD_GATEWAY_INTENTS, 10),
    },
    openclaw: {
      pluginId: '@vannadii/devplat-openclaw',
      gateway: {
        bind: 'loopback',
        port: defaultGatewayPort,
        authMode: 'token',
      },
      actionGates: {
        approveThis: true,
        mergeNow: false,
        retryGates: true,
        rebaseAllDependents: true,
      },
    },
    sonar: {
      organization: runtimeEnv.SONAR_ORGANIZATION,
      projectKey: runtimeEnv.SONAR_PROJECT_KEY,
      minimumCoverage: 90,
    },
  };

  return [
    createStep(
      'resolve_runtime_config',
      runtimeConfigInput,
      {
        githubOwner: runtimeEnv.GITHUB_OWNER,
        githubRepo: runtimeEnv.GITHUB_REPO,
        discord: {
          applicationId: runtimeEnv.DISCORD_APPLICATION_ID,
          defaultGuildId: runtimeEnv.DISCORD_DEFAULT_GUILD_ID,
        },
        sonar: {
          projectKey: runtimeEnv.SONAR_PROJECT_KEY,
        },
      },
      'config',
    ),
    createStep(
      'create_openclaw_plugin_config',
      pluginConfigInput,
      {
        id: '@vannadii/devplat-openclaw:config',
        defaultGuildId: runtimeEnv.DISCORD_DEFAULT_GUILD_ID,
        specChannelId: runtimeEnv.DISCORD_SPEC_CHANNEL_ID,
      },
      'config',
    ),
    createStep(
      'evaluate_policy_action',
      { action: 'retry-gates', privileged: false },
      {
        action: 'retry-gates',
        actionCategory: 'command-execution',
        allowed: true,
        auditRequired: true,
        nextAction: 'execute-with-audit',
        privileged: false,
        requiresApproval: false,
      },
      'config',
    ),
    createStep(
      'evaluate_policy_action',
      { action: 'merge-now', privileged: false },
      {
        action: 'merge-now',
        actionCategory: 'merge',
        allowed: false,
        auditRequired: true,
        escalationRequired: true,
        escalationTarget: 'operator',
        nextAction: 'request-merge-approval',
        privileged: false,
        requiresApproval: true,
        riskLevel: 'high',
      },
      'config',
    ),
    createStep(
      'create_research_brief',
      {
        researchId: 'research-1',
        topic: ' Discord-first workflows ',
        question: 'What should Phase 0 expose?',
        constraints: ['auditability', 'auditability'],
        findings: ['thread isolation'],
        recommendation: 'Expose thread-aware tools.',
        sourceUrls: ['https://example.com/openclaw'],
        updatedAt: fixedTimestamp,
      },
      { artifactType: 'research-brief', payload: { researchId: 'research-1' } },
      'planning',
    ),
    createStep(
      'create_spec_record',
      {
        specId: 'spec-1',
        researchId: 'research-1',
        title: ' Discord approval flow ',
        objective: 'Add explicit approval routing.',
        acceptanceCriteria: ['policy check', 'audit artifact'],
        approvalState: 'review',
        version: 1,
        updatedAt: fixedTimestamp,
      },
      { artifactType: 'spec-record', payload: { specId: 'spec-1' } },
      'planning',
    ),
    createStep(
      'approve_spec_record',
      {
        specId: 'spec-1',
        researchId: 'research-1',
        title: ' Discord approval flow ',
        objective: 'Add explicit approval routing.',
        acceptanceCriteria: ['policy check', 'audit artifact'],
        approvalState: 'review',
        version: 1,
        updatedAt: fixedTimestamp,
      },
      {
        artifactType: 'spec-record',
        status: 'approved',
        payload: { approvalState: 'approved' },
      },
      'planning',
    ),
    createStep(
      'update_spec_record',
      {
        specId: 'spec-1',
        researchId: 'research-1',
        title: ' Discord approval flow ',
        objective: 'Add explicit approval routing.',
        acceptanceCriteria: ['policy check', 'audit artifact'],
        approvalState: 'approved',
        version: 2,
        updatedAt: fixedTimestamp,
      },
      { artifactType: 'spec-record', payload: { version: 3 } },
      'planning',
    ),
    createStep(
      'create_slice_plan',
      {
        sliceId: 'slice-1',
        specId: 'spec-1',
        title: ' Wire Discord controls ',
        dependsOn: ['slice-0'],
        acceptanceCriteria: ['control persisted'],
        doneConditions: ['tests pass'],
        size: 'small',
        updatedAt: fixedTimestamp,
      },
      { sliceId: 'slice-1', title: 'Wire Discord controls' },
      'planning',
    ),
    createStep(
      'evaluate_slice_plan_readiness',
      {
        plan: {
          sliceId: 'slice-2',
          specId: 'spec-1',
          title: ' Wire Discord controls ',
          dependsOn: ['slice-0', 'slice-1'],
          acceptanceCriteria: ['control persisted'],
          doneConditions: ['tests pass'],
          size: 'small',
          updatedAt: fixedTimestamp,
        },
        completedSliceIds: ['slice-0'],
      },
      { ready: false, completedSliceIds: ['slice-0'] },
      'planning',
    ),
    createStep(
      'evaluate_slice_plan_readiness',
      {
        plan: {
          sliceId: 'slice-2',
          specId: 'spec-1',
          title: ' Wire Discord controls ',
          dependsOn: ['slice-0', 'slice-1'],
          acceptanceCriteria: ['control persisted'],
          doneConditions: ['tests pass'],
          size: 'small',
          updatedAt: fixedTimestamp,
        },
        completedSliceIds: ['slice-0', 'slice-1'],
      },
      { ready: true, completedSliceIds: ['slice-0', 'slice-1'] },
      'planning',
    ),
    createStep(
      'create_task_record',
      {
        id: 'queue-openclaw-1',
        summary: ' Queue a Discord implementation slice ',
        status: 'queued',
        trace: [],
        updatedAt: fixedTimestamp,
        taskId: 'task-1',
        sliceId: 'slice-1',
        threadId: 'thread-1',
      },
      { taskId: 'task-1', status: 'queued' },
      'planning',
    ),
    createStep(
      'claim_task',
      {
        taskId: 'task-1',
        sliceId: 'slice-1',
        threadId: 'thread-1',
        assigneeId: 'worker-1',
        record: createQueuedTaskRecord(),
      },
      {
        id: 'queue-openclaw-1',
        status: 'claimed',
        assigneeId: 'worker-1',
        transitions: [
          {
            toStatus: 'queued',
            action: 'create',
            reason: 'Created task task-1',
            occurredAt: fixedTimestamp,
          },
          {
            fromStatus: 'queued',
            toStatus: 'claimed',
            action: 'claim',
            actorId: 'worker-1',
            reason: 'Claimed task task-1',
            occurredAt: fixedTimestamp,
          },
        ],
      },
      'planning',
    ),
    createStep(
      'update_task',
      {
        taskId: 'task-1',
        sliceId: 'slice-1',
        threadId: 'thread-1',
        status: 'complete',
        record: createClaimedTaskRecord(),
      },
      {
        id: 'queue-openclaw-1',
        status: 'complete',
        assigneeId: 'worker-1',
        transitions: [
          {
            toStatus: 'queued',
            action: 'create',
            reason: 'Created task task-1',
            occurredAt: fixedTimestamp,
          },
          {
            fromStatus: 'queued',
            toStatus: 'claimed',
            action: 'claim',
            actorId: 'worker-1',
            reason: 'Claimed task task-1',
            occurredAt: fixedTimestamp,
          },
          {
            fromStatus: 'claimed',
            toStatus: 'complete',
            action: 'complete',
            reason: 'Moved task task-1 to complete',
            occurredAt: fixedTimestamp,
          },
        ],
      },
      'planning',
    ),
    createStep(
      'open_discord_thread',
      {
        id: 'session-openclaw-1',
        summary: 'Spec thread',
        status: 'approved',
        trace: [],
        updatedAt: fixedTimestamp,
        guildId: 'guild-1',
        channelId: 'channel-1',
        parentChannelId: 'parent-1',
        threadId: 'thread-1',
        kind: 'spec',
        specId: 'spec-1',
        sliceId: null,
        pullRequestNumber: null,
        artifactId: 'artifact-1',
        actorId: 'operator-1',
      },
      { artifactId: 'artifact-1', persistedKey: 'session-openclaw-1' },
      'control',
    ),
    createStep(
      'bind_discord_thread',
      {
        id: 'binding-1',
        summary: 'Bind spec thread',
        status: 'approved',
        trace: [],
        updatedAt: fixedTimestamp,
        guildId: 'guild-1',
        channelId: 'channel-1',
        kind: 'spec',
        threadBindingMode: 'inherit-parent',
        threadId: 'thread-1',
        parentChannelId: 'channel-1',
        actorId: 'operator-1',
      },
      { threadId: 'thread-1', routingKey: 'guild-1:spec:thread-1' },
      'control',
    ),
    createStep(
      'handle_discord_control',
      {
        id: 'discord-control-allow-1',
        summary: 'Retry gates',
        status: 'review',
        trace: [],
        updatedAt: fixedTimestamp,
        actorId: 'operator-1',
        threadId: 'thread-1',
        channelId: 'channel-1',
        action: 'retry-gates',
        privileged: false,
      },
      { allowed: true, policyDecisionId: 'policy-retry-gates' },
      'control',
    ),
    createStep(
      'handle_discord_control',
      {
        id: 'discord-control-deny-1',
        summary: 'release worktree',
        status: 'review',
        trace: [],
        updatedAt: fixedTimestamp,
        actorId: 'operator-1',
        threadId: 'thread-1',
        channelId: 'channel-1',
        action: 'release-worktree',
        privileged: false,
      },
      { allowed: false, policyDecisionId: 'policy-release-worktree' },
      'control',
    ),
    createStep(
      'handle_discord_control',
      {
        id: 'discord-interaction-allow-1',
        token: 'discord-interaction-token-1',
        actorId: 'operator-1',
        channelId: 'channel-1',
        boundThreadId: 'thread-1',
        commandName: 'retry-gates',
        summary: 'Retry gates from interaction callback',
        privileged: false,
        updatedAt: fixedTimestamp,
        boundSession: {
          id: 'session-openclaw-1',
          summary: 'Implementation thread',
          status: 'running',
          trace: [],
          updatedAt: fixedTimestamp,
          guildId: 'guild-1',
          channelId: 'channel-1',
          parentChannelId: 'parent-1',
          threadId: 'thread-1',
          kind: 'implementation',
          specId: 'spec-1',
          sliceId: 'slice-1',
          pullRequestNumber: null,
          artifactId: 'artifact-1',
        },
      },
      {
        allowed: true,
        failedClosed: false,
        policyDecisionId: 'policy-retry-gates',
        responseReceipt: {
          endpoint:
            '/interactions/discord-interaction-allow-1/discord-interaction-token-1/callback',
          responseBody: {
            mode: 'loopback',
          },
        },
        threadReceipt: {
          endpoint: '/channels/thread-1/messages',
          responseBody: {
            mode: 'loopback',
          },
        },
        workItem: {
          threadKind: 'implementation',
          specId: 'spec-1',
          sliceId: 'slice-1',
        },
      },
      'control',
    ),
    createStep(
      'handle_discord_approval',
      {
        id: 'approval-1',
        summary: 'Approve this',
        status: 'review',
        trace: [],
        updatedAt: fixedTimestamp,
        actorId: 'operator-1',
        channelId: 'channel-1',
        threadId: 'thread-1',
        action: 'approve',
        artifactId: 'artifact-1',
        privileged: true,
      },
      { allowed: false, policyDecisionId: 'policy-approve-this' },
      'control',
    ),
    createStep(
      'remember_memory_entry',
      {
        memoryId: 'memory-openclaw-1',
        kind: 'decision',
        subject: ' Use Discord as the primary control plane ',
        detail: ' Keep the operator flow auditable and thread-scoped. ',
        tags: ['discord', 'discord', ' audit '],
        status: 'active',
        sourceArtifactId: 'artifact-1',
        updatedAt: fixedTimestamp,
      },
      { memoryId: 'memory-openclaw-1', tags: ['discord', 'audit'] },
      'control',
    ),
    createStep(
      'store_record',
      {
        record: {
          id: 'storage-openclaw-artifact-1',
          key: 'storage-openclaw-artifact-1',
          scope: 'artifacts',
          summary: ' Persisted artifact snapshot ',
          status: 'complete',
          trace: [],
          updatedAt: fixedTimestamp,
          indexes: ['artifact'],
          payload: {
            artifactType: 'audit-log',
          },
        },
        actorId: 'operator-1',
        privileged: false,
      },
      {
        allowed: true,
        policyDecisionId: 'policy-store-record',
        record: {
          key: 'storage-openclaw-artifact-1',
          scope: 'artifacts',
        },
      },
      'control',
    ),
    createStep(
      'read_stored_record',
      {
        scope: 'artifacts',
        key: 'storage-openclaw-artifact-1',
      },
      {
        status: 'ok',
        scope: 'artifacts',
        key: 'storage-openclaw-artifact-1',
      },
      'control',
    ),
    createStep(
      'list_stored_records',
      {
        scope: 'memory',
      },
      {
        status: 'ok',
        scope: 'memory',
      },
      'control',
    ),
    createStep(
      'read_stored_index',
      {
        indexName: 'artifact',
        key: 'storage-openclaw-artifact-1',
      },
      {
        status: 'ok',
        indexName: 'artifact',
        key: 'storage-openclaw-artifact-1',
      },
      'control',
    ),
    createStep(
      'read_indexed_record',
      {
        indexName: 'artifact',
        key: 'storage-openclaw-artifact-1',
      },
      {
        status: 'ok',
        indexName: 'artifact',
        key: 'storage-openclaw-artifact-1',
      },
      'control',
    ),
    createStep(
      'list_stored_index',
      {
        indexName: 'artifact',
      },
      {
        status: 'ok',
        indexName: 'artifact',
      },
      'control',
    ),
    createStep(
      'record_telemetry_event',
      {
        id: 'telemetry-openclaw-1',
        summary: ' Sync branch telemetry ',
        status: 'approved',
        trace: [],
        updatedAt: fixedTimestamp,
        actorId: 'operator-1',
        action: 'sync-branch',
        scope: 'github',
        details: {
          prNumber: 42,
        },
      },
      { id: 'telemetry-openclaw-1', summary: 'Sync branch telemetry' },
      'control',
    ),
    createStep(
      'execute_command',
      {
        command: process.execPath,
        args: ['-e', 'process.stdout.write("blocked")'],
        actorId: 'operator-1',
        privileged: true,
      },
      {
        allowed: false,
        policyDecisionId: 'policy-execute-command',
        request: { command: process.execPath },
      },
      'control',
    ),
    createStep(
      'allocate_worktree',
      {
        taskId: 'task-1',
        branchName: 'feature/task-1',
      },
      {
        taskId: 'task-1',
        branchName: 'feature/task-1',
        worktreePath: `${resolveRuntimeWorktreeRoot(runtimeEnv)}/feature/task-1`,
      },
      'delivery',
    ),
    createStep(
      'sync_worktree',
      {
        allocation: createBaseWorktreeAllocation(runtimeEnv),
        baseBranch: 'main',
        syncMode: 'fast-forward',
      },
      { taskId: 'task-1', syncMode: 'fast-forward' },
      'delivery',
    ),
    createStep(
      'release_worktree',
      {
        allocation: createBaseWorktreeAllocation(runtimeEnv),
        releaseMode: 'delete',
      },
      { taskId: 'task-1', releaseMode: 'delete', released: true },
      'delivery',
    ),
    createStep(
      'create_review_finding',
      {
        findingId: 'finding-1',
        severity: 'high',
        path: 'packages/openclaw/src/tool-surfaces/service.ts',
        message: 'Missing policy mediation.',
        rationale: 'Privileged actions must stay policy-aware.',
        fixRecommendation: 'Delegate through the policy service.',
        blocking: true,
        updatedAt: fixedTimestamp,
      },
      { artifactType: 'review-finding', payload: { findingId: 'finding-1' } },
      'delivery',
    ),
    createStep(
      'create_remediation_plan',
      {
        findings: [
          {
            findingId: 'finding-1',
            severity: 'medium',
            path: 'packages/openclaw/src/tool-surfaces/service.ts',
            message: 'Add test coverage.',
            rationale: 'The adapter needs direct surface tests.',
            fixRecommendation: 'Add a focused service test.',
            blocking: false,
            updatedAt: fixedTimestamp,
          },
        ],
        autofix: true,
      },
      { findingIds: ['finding-1'], autofix: true },
      'delivery',
    ),
    createStep(
      'verify_sonar_bootstrap',
      {
        projectKey: runtimeEnv.SONAR_PROJECT_KEY,
        qualityGateStatus: 'OK',
        conditions: [
          {
            metricKey: 'coverage',
            comparator: 'LT',
            errorThreshold: '90',
            actualValue: '99.69',
          },
          {
            metricKey: 'new_coverage',
            comparator: 'LT',
            errorThreshold: '90',
            actualValue: '100',
          },
        ],
        evaluatedAt: fixedTimestamp,
      },
      { projectKey: runtimeEnv.SONAR_PROJECT_KEY, status: 'passed' },
      'delivery',
    ),
    createStep(
      'evaluate_sonar_quality_gate',
      {
        projectKey: runtimeEnv.SONAR_PROJECT_KEY,
        overallCoverage: 91,
        newCodeCoverage: 92,
        blockingIssues: 0,
      },
      { projectKey: runtimeEnv.SONAR_PROJECT_KEY, status: 'passed' },
      'delivery',
    ),
    createStep(
      'create_pull_request_record',
      {
        prNumber: 42,
        branchName: ' feature/discord-tools ',
        baseBranch: ' main ',
        title: ' Expand OpenClaw pull request wiring ',
        labels: ['automation', 'automation', ' review '],
        reviewState: 'review',
        mergeReady: false,
        updatedAt: fixedTimestamp,
      },
      { prNumber: 42, mergeReady: false, labels: ['automation', 'review'] },
      'delivery',
    ),
    createStep(
      'submit_pull_request_update',
      {
        record: createBasePullRequestRecord(),
        actorId: 'operator-1',
      },
      { allowed: false, request: { action: 'update-pr' } },
      'delivery',
    ),
    createStep(
      'submit_pull_request_merge',
      {
        record: createBasePullRequestRecord(),
        actorId: 'operator-1',
      },
      { allowed: false, request: { action: 'merge-pr' } },
      'delivery',
    ),
    createStep(
      'plan_rebase_dependents',
      {
        record: createBasePullRequestRecord(),
        dependentBranches: ['feature/downstream'],
      },
      { mergedPrNumber: 42, rebaseRequired: true },
      'delivery',
    ),
    createStep(
      'execute_rebase_dependents',
      {
        record: createBasePullRequestRecord(),
        dependentBranches: ['feature/downstream'],
        syncMode: 'rebase',
      },
      { executed: true, syncMode: 'rebase' },
      'delivery',
    ),
    createStep(
      'create_github_action_request',
      {
        repoFullName: `${runtimeEnv.GITHUB_OWNER}/${runtimeEnv.GITHUB_REPO}`,
        action: 'sync-branch',
        summary: ' Sync downstream branch ',
        privileged: false,
        branchName: ' feature/downstream ',
        updatedAt: fixedTimestamp,
      },
      {
        repoFullName: `${runtimeEnv.GITHUB_OWNER}/${runtimeEnv.GITHUB_REPO}`,
        action: 'sync-branch',
      },
      'delivery',
    ),
    createStep(
      'submit_github_action',
      {
        request: {
          repoFullName: `${runtimeEnv.GITHUB_OWNER}/${runtimeEnv.GITHUB_REPO}`,
          action: 'sync-branch',
          summary: 'Sync downstream branch',
          privileged: false,
          branchName: 'feature/downstream',
          targetNumber: 42,
          updatedAt: fixedTimestamp,
        },
        actorId: 'operator-1',
      },
      { allowed: true, request: { action: 'sync-branch' } },
      'delivery',
    ),
    createStep(
      'run_supervisor_step',
      {
        action: 'retry-gates',
        actorId: 'operator-1',
        privileged: false,
      },
      { approved: true, nextState: 'approved' },
      'delivery',
    ),
    createStep(
      'create_artifact_envelope',
      {
        id: 'artifact-generic-1',
        artifactType: 'audit-log',
        version: 1,
        summary: ' Generic audit artifact ',
        status: 'approved',
        trace: [],
        updatedAt: fixedTimestamp,
        payload: {
          actorId: 'operator-1',
        },
      },
      { artifactType: 'audit-log', summary: 'Generic audit artifact' },
      'contracts',
    ),
    createStep(
      'create_approval_record',
      createApprovalArtifact(),
      { artifactType: 'approval-record', summary: 'Approve slice' },
      'contracts',
    ),
    createStep(
      'create_audit_log',
      {
        id: 'artifact-audit-1',
        artifactType: 'audit-log',
        version: 1,
        summary: ' Retry gates ',
        status: 'complete',
        trace: [],
        updatedAt: fixedTimestamp,
        payload: {
          auditId: ' audit-1 ',
          actorId: ' operator-1 ',
          action: 'retry-gates',
          scope: 'discord',
          details: {
            threadId: 'thread-1',
          },
        },
      },
      { artifactType: 'audit-log', summary: 'Retry gates' },
      'contracts',
    ),
    createStep(
      'create_merge_decision',
      {
        id: 'artifact-merge-1',
        artifactType: 'merge-decision',
        version: 1,
        summary: ' Merge decision ',
        status: 'approved',
        trace: [],
        updatedAt: fixedTimestamp,
        payload: {
          decisionId: ' merge-1 ',
          prNumber: 42,
          actorId: ' operator-1 ',
          mergeStrategy: 'squash',
          approved: true,
          rationale: ' Ready to merge ',
          blockingFindings: [' none '],
        },
      },
      { artifactType: 'merge-decision', payload: { decisionId: 'merge-1' } },
      'contracts',
    ),
    createStep(
      'create_rebase_result',
      {
        id: 'artifact-rebase-1',
        artifactType: 'rebase-result',
        version: 1,
        summary: ' Rebase result ',
        status: 'complete',
        trace: [],
        updatedAt: fixedTimestamp,
        payload: {
          resultId: ' rebase-1 ',
          mergedPrNumber: 42,
          baseBranch: ' main ',
          branchName: ' feature/x ',
          rebased: true,
          conflictsDetected: false,
          details: ' Rebased cleanly ',
        },
      },
      { artifactType: 'rebase-result', payload: { resultId: 'rebase-1' } },
      'contracts',
    ),
    createStep(
      'validate_artifact',
      {
        artifact: createApprovalArtifact(),
      },
      {
        artifactType: 'approval-record',
        summary: 'Approve slice',
        payload: { approvalId: 'approval-1' },
      },
      'contracts',
    ),
  ];
}

export function validateDeepTestReport(report) {
  if (report.mode !== 'hermetic' && report.mode !== 'live') {
    throw new Error('Deep-test report mode must be hermetic or live.');
  }

  if (!Array.isArray(report.steps) || report.steps.length === 0) {
    throw new Error('Deep-test report must include executed steps.');
  }

  for (const scope of ['artifacts', 'memory', 'state', 'telemetry']) {
    if (
      !Array.isArray(report.persisted[scope]) ||
      report.persisted[scope].length === 0
    ) {
      throw new Error(
        `Deep-test report is missing persisted ${scope} records.`,
      );
    }
  }

  const failingStep = report.steps.find((step) => step.ok !== true);
  if (failingStep) {
    throw new Error(
      `Deep-test report contains a failing step for ${failingStep.tool}.`,
    );
  }

  return true;
}

async function invokeTool({
  commandRunner,
  containerName,
  gatewayToken,
  step,
}) {
  const script = createInvokeScript({
    gatewayToken,
    request: createInvokeRequest(step.tool, step.params),
  });
  const response = await commandRunner('docker', [
    'exec',
    containerName,
    'node',
    '-e',
    script,
  ]);

  return JSON.parse(response.stdout);
}

async function waitForGatewayReadiness({
  commandRunner,
  containerName,
  gatewayToken,
  timeoutMs,
  pollMs,
}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await invokeTool({
        commandRunner,
        containerName,
        gatewayToken,
        step: createStep(
          'list_stored_records',
          { scope: 'state' },
          { status: 'ok', scope: 'state' },
          'bootstrap',
        ),
      });
      if (response.status === 200 && response.body?.ok === true) {
        return;
      }

      lastError = new Error(
        `Unexpected readiness response: ${response.status}`,
      );
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, pollMs);
    });
  }

  const detail =
    lastError === null ? '.' : `: ${serializeError(lastError).message}`;
  throw new Error(
    `Gateway readiness timed out after ${String(timeoutMs)}ms${detail}`,
  );
}

async function captureContainerLogs(commandRunner, containerName) {
  try {
    const result = await commandRunner('docker', ['logs', containerName]);
    return `${result.stdout}${result.stderr}`;
  } catch (error) {
    return `Failed to capture container logs: ${serializeError(error).message}`;
  }
}

async function writeArtifactRuntimeEnv({
  reportDirectory,
  runtimeEnv,
  writeTextFile,
}) {
  await writeTextFile(
    resolve(reportDirectory, 'runtime-env.json'),
    `${JSON.stringify(sanitizeSnapshotForArtifacts(runtimeEnv), null, 2)}\n`,
    'utf8',
  );
}

async function writeArtifactGatewayConfig({
  gatewayConfig,
  runtimeDirectory,
  writeTextFile,
}) {
  await writeTextFile(
    resolve(runtimeDirectory, 'openclaw.json'),
    `${JSON.stringify(sanitizeSnapshotForArtifacts(gatewayConfig), null, 2)}\n`,
    'utf8',
  );
}

export async function runDeepTest(options, dependencies = {}) {
  const commandRunner = dependencies.commandRunner ?? runCommand;
  const removeDirectory = dependencies.removeDirectory ?? rm;
  const makeDirectory = dependencies.makeDirectory ?? mkdir;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const makeTempDirectory =
    dependencies.makeTempDirectory ??
    (async (prefix) => {
      const directory = join(tmpdir(), `${prefix}-${randomUUID()}`);
      await makeDirectory(directory, { recursive: true });
      return directory;
    });
  const collectStoredKeysFn =
    dependencies.collectStoredKeys ?? collectStoredKeys;
  const validateReport = dependencies.validateReport ?? validateDeepTestReport;
  const onProgress = dependencies.onProgress ?? (() => undefined);
  const beforeCleanup = options.beforeCleanup ?? (() => undefined);
  const scenario = options.scenario ?? createDeepScenario(options.runtimeEnv);
  const gatewayToken = options.gatewayToken ?? `deep-test-${randomUUID()}`;
  const reportDirectory =
    options.reportDir ??
    (await makeTempDirectory('devplat-openclaw-deep-test'));
  const runtimeDirectory = resolve(reportDirectory, 'runtime');
  const bundledExtensionsDirectory = resolve(
    runtimeDirectory,
    'bundled-extensions',
  );
  const homeDirectory = resolve(runtimeDirectory, 'home');
  const openclawHomeDirectory = resolve(runtimeDirectory, 'openclaw-home');
  const runtimeTempDirectory = resolve(runtimeDirectory, 'tmp');
  const devplatStateDirectory = resolve(reportDirectory, 'devplat-state');
  const imageTag =
    options.image ??
    `${defaultImageTagPrefix}:${createScopedRuntimeName(reportDirectory)}`;
  const containerName =
    options.containerName ??
    sanitizeNameSegment(
      `devplat-openclaw-${createScopedRuntimeName(reportDirectory)}`,
    );
  const runtimeEnv = options.runtimeEnv ?? createRuntimeEnv();
  const pluginConfig = options.pluginConfig ?? createPluginConfig(runtimeEnv);
  const gatewayConfig = createGatewayConfig({
    gatewayToken,
    pluginConfig,
  });

  await ensureWritableDirectory(runtimeDirectory);
  await ensureWritableDirectory(bundledExtensionsDirectory);
  await ensureWritableDirectory(homeDirectory);
  await ensureWritableDirectory(openclawHomeDirectory);
  await ensureWritableDirectory(runtimeTempDirectory);
  await ensureWritableDirectory(devplatStateDirectory);
  await writeTextFile(
    resolve(runtimeDirectory, 'openclaw.json'),
    `${JSON.stringify(gatewayConfig, null, 2)}\n`,
    'utf8',
  );
  await writeArtifactRuntimeEnv({
    reportDirectory,
    runtimeEnv,
    writeTextFile,
  });

  const report = {
    containerName,
    imageTag,
    mode: options.mode,
    persisted: {
      artifacts: [],
      memory: [],
      state: [],
      telemetry: [],
    },
    reportDirectory,
    startedAt: new Date().toISOString(),
    steps: [],
    warnings: [],
  };

  let containerStarted = false;
  const removeBuiltImage =
    !options.skipBuild && options.image === undefined && !options.retainImage;

  try {
    if (!options.skipBuild) {
      onProgress({
        phase: 'build',
        message: `Building ${imageTag}`,
      });
      await commandRunner('docker', buildDockerBuildArgs(imageTag), {
        cwd: repoRootDirectory,
      });
    }

    onProgress({
      phase: 'container',
      message: `Starting ${containerName}`,
    });
    await commandRunner(
      'docker',
      buildDockerRunArgs({
        bundledExtensionsDirectory,
        containerName,
        devplatStateDirectory,
        imageTag,
        mode: options.mode,
        runtimeEnv,
        runtimeDirectory,
      }),
      {
        cwd: repoRootDirectory,
        env: runtimeEnv,
      },
    );
    containerStarted = true;

    await waitForGatewayReadiness({
      commandRunner,
      containerName,
      gatewayToken,
      timeoutMs: options.readinessTimeoutMs ?? defaultReadinessTimeoutMs,
      pollMs: options.readinessPollMs ?? defaultReadinessPollMs,
    });

    for (const step of scenario) {
      onProgress({
        phase: step.phase,
        message: `Invoking ${step.tool}`,
        step: step.tool,
      });
      const response = await invokeTool({
        commandRunner,
        containerName,
        gatewayToken,
        step,
      });
      if (response.status !== 200) {
        throw new Error(
          `Tool ${step.tool} returned HTTP ${String(response.status)}.`,
        );
      }
      if (response.body?.ok !== true) {
        throw new Error(`Tool ${step.tool} returned a failed body.`);
      }

      assertPartialMatch(step.expected, response.body.result?.details);
      report.steps.push({
        tool: step.tool,
        phase: step.phase,
        ok: true,
        status: response.status,
      });
    }

    report.persisted = await collectStoredKeysFn(devplatStateDirectory);
    report.completedAt = new Date().toISOString();
    validateReport(report);
    const mountedStateWarning = await ensureMountedStateWritable({
      commandRunner,
      containerName,
    });
    appendDeepTestWarning(report, mountedStateWarning);
    await beforeCleanup({
      containerName,
      devplatStateDirectory,
      gatewayToken,
      report,
      reportDirectory,
    });
  } catch (error) {
    report.error = serializeError(error);
    report.containerLogs = containerStarted
      ? await captureContainerLogs(commandRunner, containerName)
      : '';
    report.completedAt = new Date().toISOString();
    if (containerStarted && !options.retainContainerOnFailure) {
      await commandRunner('docker', ['rm', '-f', containerName]).catch(
        () => undefined,
      );
    }
    await cleanupBuiltImage({
      commandRunner,
      imageTag,
      removeBuiltImage,
    });
    await writeArtifactGatewayConfig({
      gatewayConfig,
      runtimeDirectory,
      writeTextFile,
    });
    await writeTextFile(
      resolve(reportDirectory, 'deep-test-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    throw error;
  }

  report.containerLogs = await captureContainerLogs(
    commandRunner,
    containerName,
  );
  if (containerStarted) {
    await commandRunner('docker', ['rm', '-f', containerName]);
  }
  await cleanupBuiltImage({
    commandRunner,
    imageTag,
    removeBuiltImage,
  });
  await writeArtifactGatewayConfig({
    gatewayConfig,
    runtimeDirectory,
    writeTextFile,
  });
  await writeTextFile(
    resolve(reportDirectory, 'deep-test-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  if (options.cleanupReportDir === true) {
    await removeDirectory(reportDirectory, { force: true, recursive: true });
  }

  return report;
}

async function cleanupBuiltImage({
  commandRunner,
  imageTag,
  removeBuiltImage,
}) {
  if (!removeBuiltImage) {
    return;
  }

  await commandRunner('docker', ['image', 'rm', '-f', imageTag]).catch(
    () => undefined,
  );
}

async function main() {
  const args = parseDeepTestArgs(process.argv.slice(2));
  const report = await runDeepTest({
    ...args,
    runtimeEnv: createRuntimeEnv(),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        completedAt: report.completedAt,
        imageTag: report.imageTag,
        mode: report.mode,
        persisted: report.persisted,
        reportDirectory: report.reportDirectory,
        steps: report.steps.length,
      },
      null,
      2,
    )}\n`,
  );
}

const entryPath =
  process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;

if (entryPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${serializeError(error).message}\n`);
    process.exitCode = 1;
  });
}
