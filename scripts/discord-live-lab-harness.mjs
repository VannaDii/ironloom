import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Repository root used by live-lab helper imports.
 */
const repoRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Compiled workspace package entrypoint used by normal live-lab execution.
 */
const workspacePackageDistEntrypoint = 'dist/index.js';

/**
 * Source workspace package entrypoint used by preflight tests before builds exist.
 */
const workspacePackageSourceEntrypoint = 'src/index.ts';

/**
 * Environment flag Vitest sets while executing source-compatible preflight tests.
 */
const vitestEnvironmentKey = 'VITEST';

/**
 * Node options environment key that can carry `--import tsx`.
 */
const nodeOptionsEnvironmentKey = 'NODE_OPTIONS';

/**
 * Loader marker that means Node can import TypeScript entrypoints directly.
 */
const typescriptLoaderMarker = 'tsx';

/**
 * Shared Discord category used by live-lab and OpenClaw test runs.
 */
export const testDiscordCategoryName = 'test';

/**
 * Discord component wire field for the developer-defined interaction id.
 */
export const discordComponentCustomIdField = 'custom_id';

/**
 * Discord channel type for public threads created under text channels.
 */
const discordPublicThreadChannelType = 11;

/**
 * Short Discord thread auto-archive window for sandbox live-lab controls.
 */
const discordLiveLabThreadAutoArchiveMinutes = 60;

/**
 * Returns true when the current process can import TypeScript source files.
 */
function canImportTypeScriptEntrypoints({ env, execArgv }) {
  const nodeOptions = env[nodeOptionsEnvironmentKey];

  return (
    env[vitestEnvironmentKey] !== undefined ||
    execArgv.some((value) => value.includes(typescriptLoaderMarker)) ||
    (typeof nodeOptions === 'string' &&
      nodeOptions.includes(typescriptLoaderMarker))
  );
}

/**
 * Creates the actionable build-required error for live-lab package loading.
 */
function createWorkspacePackageBuildRequiredError(packageName) {
  return new Error(
    `Workspace package ${packageName} must be built before running the live lab. Run npm run build:workspace.`,
  );
}

/**
 * Determines whether a filesystem access failure means the package output is missing.
 */
function isMissingEntrypointError(error) {
  return error instanceof Error && error.code === 'ENOENT';
}

/**
 * Resolves the package entrypoint available in the current execution phase.
 */
export async function resolveWorkspacePackageEntrypoint(
  packageName,
  options = {},
) {
  const rootDirectory = options.rootDirectory ?? repoRootDirectory;
  const env = options.env ?? process.env;
  const execArgv = options.execArgv ?? process.execArgv;
  const accessFile = options.accessFile ?? access;
  const packageDirectory = resolve(rootDirectory, 'packages', packageName);
  const distEntrypoint = resolve(
    packageDirectory,
    workspacePackageDistEntrypoint,
  );

  try {
    await accessFile(distEntrypoint);
    return distEntrypoint;
  } catch (error) {
    if (!isMissingEntrypointError(error)) {
      throw error;
    }

    if (!canImportTypeScriptEntrypoints({ env, execArgv })) {
      throw createWorkspacePackageBuildRequiredError(packageName);
    }

    const sourceEntrypoint = resolve(
      packageDirectory,
      workspacePackageSourceEntrypoint,
    );
    await accessFile(sourceEntrypoint);
    return sourceEntrypoint;
  }
}

/**
 * Creates a stable HTTP request failure with status details.
 */
function createRequestError(message, status, responseText) {
  const statusFragment = status === null ? '' : ` (HTTP ${String(status)})`;
  const responseFragment = responseText.length > 0 ? `: ${responseText}` : '.';
  const error = new Error(`${message}${statusFragment}${responseFragment}`);
  error.status = status;
  error.responseText = responseText;
  return error;
}

/**
 * Requests JSON or text from an external service with consistent failures.
 */
export async function requestJson({
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

/**
 * Resolves a request path against an API base URL without dropping base paths.
 */
function resolveApiRequestUrl(path, baseUrl) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBaseUrl).toString();
}

/**
 * Creates an authenticated Discord REST request function.
 */
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

/**
 * Builds the standard Discord channel plan for live-lab traffic.
 */
export function createDiscordChannelPlan(
  categoryName = testDiscordCategoryName,
) {
  return [
    {
      categoryName,
      key: 'spec',
      name: 'spec',
    },
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
    {
      categoryName,
      key: 'audit',
      name: 'audit',
    },
    {
      categoryName,
      key: 'projectManagement',
      name: 'project-management',
    },
  ];
}

/**
 * Reads the target Discord guild for preflight validation.
 */
export async function getGuild(guildId, discordRequest) {
  return discordRequest(`/guilds/${encodeURIComponent(guildId)}`);
}

/**
 * Lists the Discord guild channels available to the bot.
 */
async function listGuildChannels({ discordRequest, guildId }) {
  return discordRequest(`/guilds/${encodeURIComponent(guildId)}/channels`);
}

/**
 * Ensures the shared Discord live-lab category exists.
 */
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

/**
 * Ensures the standard Discord live-lab channels exist under the test category.
 */
export async function ensureDiscordChannels({
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
export function createDiscordMessageBody(payload) {
  if (typeof payload === 'string') {
    return { content: payload };
  }

  return payload;
}

/**
 * Prefixes visible content while preserving structured Discord controls.
 */
export function prefixDiscordMessageContent(prefix, payload) {
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
export async function sendDiscordMessage(channelId, payload, discordRequest) {
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
export function hasDiscordActionComponents(payload) {
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
export function collectDiscordComponentCustomIds(payload) {
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
export function readDiscordReceiptMessageId(receipt) {
  const messageId = receipt?.responseBody?.id;

  return typeof messageId === 'string' ? messageId : null;
}

/**
 * Reads the visible Discord message content from a structured payload.
 */
export function readDiscordPayloadContent(payload) {
  const content = payload?.content;

  return typeof content === 'string' ? content : null;
}

/**
 * Reads the visible Discord message content from the posted receipt body.
 */
export function readDiscordReceiptContent(receipt) {
  return readDiscordPayloadContent(receipt?.body);
}

/**
 * Builds the auditable report projection for a posted Discord message.
 */
export function createDiscordMessageReceiptReport({ channelId, receipt }) {
  return {
    channelId,
    componentCustomIds: collectDiscordComponentCustomIds(receipt.body),
    content: readDiscordReceiptContent(receipt),
    endpoint: `/channels/${encodeURIComponent(channelId)}/messages`,
    messageId: readDiscordReceiptMessageId(receipt),
  };
}

/**
 * Discord response transport that records interaction effects through real messages.
 */
export class LiveLabDiscordInteractionTransport {
  constructor({ auditChannelId, discordRequest }) {
    this.auditChannelId = auditChannelId;
    this.discordRequest = discordRequest;
  }

  /** Post interaction response. */
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

  /** Post interaction deferred. */
  postInteractionDeferred(input) {
    const endpoint = `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`;
    const content =
      input.customId === undefined
        ? `simulated interaction deferred: ${input.id}`
        : `simulated component interaction acknowledged: ${input.id}`;

    return Promise.resolve({
      body: {
        content,
      },
      endpoint,
      responseBody: {
        content,
        deferred: true,
        interactionId: input.id,
        mode: 'simulated',
      },
      statusCode: 202,
    });
  }

  /** Post interaction completion. */
  postInteractionCompletion(input, content) {
    const endpoint = `/webhooks/simulated-live-lab/${encodeURIComponent(input.token)}`;

    return Promise.resolve({
      body: {
        content: content.content,
      },
      endpoint,
      responseBody: {
        content: content.content,
        interactionId: input.id,
        mode: 'simulated',
      },
      statusCode: 202,
    });
  }

  /** Post thread message. */
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

/**
 * Creates the live-lab implementation thread that owns operator controls.
 */
export async function createLiveLabImplementationThread({
  discordChannels,
  discordRequest,
  runLabel,
  sanitizeSegment,
}) {
  const threadName = `devplat-${sanitizeSegment(runLabel)}-implementation`;
  const responseBody = await discordRequest(
    `/channels/${encodeURIComponent(discordChannels.implementation.id)}/threads`,
    {
      body: {
        /**
         * Discord thread creation wire key that bounds sandbox thread lifetime.
         */
        auto_archive_duration: discordLiveLabThreadAutoArchiveMinutes,
        name: threadName,
        type: discordPublicThreadChannelType,
      },
      expectedStatuses: [200, 201],
      method: 'POST',
    },
  );

  if (typeof responseBody?.id !== 'string' || responseBody.id.length === 0) {
    throw new Error('Discord live-lab implementation thread was not created.');
  }

  return {
    id: responseBody.id,
    name: threadName,
    parentChannelId: discordChannels.implementation.id,
  };
}

/**
 * Creates a storage-backed Discord control-plane service for live-lab probes.
 */
export async function createDiscordControlPlaneService({
  reportDirectory,
  transport,
}) {
  const discordEntrypoint = await resolveWorkspacePackageEntrypoint('discord');
  const storageEntrypoint = await resolveWorkspacePackageEntrypoint('storage');
  const discordModule = await import(pathToFileURL(discordEntrypoint).href);
  const storageModule = await import(pathToFileURL(storageEntrypoint).href);
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

/**
 * Creates the Discord command registration payloads from the workspace package.
 */
export async function createDiscordApplicationCommandPayloads() {
  const discordEntrypoint = await resolveWorkspacePackageEntrypoint('discord');
  const discordModule = await import(pathToFileURL(discordEntrypoint).href);

  return discordModule.createDiscordApplicationCommandPayloads();
}

/**
 * Normalizes a raw Discord interaction callback through the workspace package.
 */
export async function createDiscordOperatorInteractionFromCallback(
  callback,
  options,
) {
  const discordEntrypoint = await resolveWorkspacePackageEntrypoint('discord');
  const discordModule = await import(pathToFileURL(discordEntrypoint).href);

  return discordModule.createDiscordOperatorInteractionFromCallback(
    callback,
    options,
  );
}

/**
 * Registers Discord application commands for the sandbox guild.
 */
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

/**
 * Creates the file store used to persist Discord thread sessions.
 */
async function createLiveLabFileStore(rootDirectory) {
  const storageEntrypoint = await resolveWorkspacePackageEntrypoint('storage');
  const storageModule = await import(pathToFileURL(storageEntrypoint).href);

  return new storageModule.FileStoreService(rootDirectory);
}

/**
 * Persists a Discord Gateway-bound thread session for live replay.
 */
export async function persistDiscordGatewayBoundSession(
  { boundSession, reportDirectory },
  dependencies = {},
) {
  const storeFactory =
    dependencies.createFileStoreService ?? createLiveLabFileStore;
  const store = await storeFactory(
    resolve(reportDirectory, 'deep-test', 'devplat-state'),
  );
  const record = await store.store({
    id: boundSession.id,
    key: boundSession.id,
    scope: 'state',
    summary: boundSession.summary,
    status: boundSession.status,
    trace: boundSession.trace,
    updatedAt: boundSession.updatedAt,
    payload: boundSession,
  });

  return {
    key: record.key,
    scope: record.scope,
  };
}
