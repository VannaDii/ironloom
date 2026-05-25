import {
  DEVPLAT_ACTION_ALTERNATIVES,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CANCEL_PROJECT,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_CONSIDER,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_PHASE_CONTRACT,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
  DEVPLAT_ACTION_PROJECT_SUMMARY,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_REDIRECT,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESEARCH,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_PROJECT,
  DEVPLAT_ACTION_RESUME_PROJECT,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SPEC,
  DEVPLAT_ACTION_SYNC_WORKTREE,
} from '@vannadii/devplat-core';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_BASE64URL_MARKER_PATTERN,
  DISCORD_APPLICATION_ID_ENVIRONMENT_VARIABLE,
  DISCORD_PROJECT_CONFIG_VERSION_PATTERN,
  DISCORD_REST_SUCCESS_MAX_EXCLUSIVE_STATUS,
  DISCORD_REST_SUCCESS_MIN_STATUS,
  DISCORD_INTERACTION_CHANNEL_MESSAGE_RESPONSE_TYPE,
  DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
  DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
} from './constants.js';
import {
  createDiscordControlRequest,
  createDiscordControlRequestFromInteraction,
  describeDiscordControlRequest,
} from './logic.js';
import {
  renderDiscordArtifactMessage,
  renderDiscordControlAcceptedMessage,
  renderDiscordControlBlockedMessage,
  renderDiscordInteractionCompletionMessage,
  renderDiscordInteractionThreadPostFailureCompletionMessage,
  renderDiscordRouteFailureMessage,
} from './renderer.js';
import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordControlResult,
  DiscordMessagePayload,
  DiscordOperatorInteraction,
  DiscordResponseReceipt,
} from './codec.js';

/**
 * Policy decision returned for a Discord control action before persistence.
 */
type DiscordControlActionDecision = ReturnType<
  DecisionPolicyService['evaluateControlAction']
>;

/**
 * Result of posting the post-acknowledgement thread status message.
 */
type DiscordThreadPostResult =
  | {
      readonly ok: true;
      readonly threadReceipt: DiscordResponseReceipt;
    }
  | {
      readonly ok: false;
      readonly threadPostError: string;
      readonly threadReceipt?: DiscordResponseReceipt;
    };

/**
 * Result of posting the initial Discord interaction acknowledgement.
 */
type DiscordInteractionAcknowledgementResult =
  | {
      readonly ok: true;
      readonly responseReceipt: DiscordResponseReceipt;
    }
  | {
      readonly ok: false;
      readonly responsePostError: string;
      readonly responseReceipt?: DiscordResponseReceipt;
    };

/**
 * Result of completing a previously deferred Discord interaction.
 */
type DiscordInteractionCompletionResult =
  | {
      readonly ok: true;
      readonly completionReceipt: DiscordResponseReceipt;
    }
  | {
      readonly ok: false;
      readonly completionPostError: string;
      readonly completionReceipt?: DiscordResponseReceipt;
    };

/**
 * Record-like payload shape used for metadata extraction.
 */
type UnknownRecord = {
  readonly [key: string]: unknown;
};

/**
 * Returns true when a value is a non-null record-like object.
 */
function isUnknownRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object';
}

/**
 * Parses an `intent:<value>` marker from a normalized request summary.
 */
function resolveOpenProjectIntentFromSummary(
  summary: string,
): string | undefined {
  const marker = '(intent:';
  const markerIndex = summary.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const start = markerIndex + marker.length;
  const end = summary.indexOf(')', start);
  if (end < 0) {
    return undefined;
  }

  const intent = summary.slice(start, end).trim();
  return intent.length === 0 ? undefined : intent;
}

/**
 * Parses the final `(repo:<value>)` marker from a normalized request summary.
 */
function resolveProjectRepoFromSummary(summary: string): string | undefined {
  const marker = '(repo:';
  const markerIndex = summary.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  const start = markerIndex + marker.length;
  const end = summary.indexOf(')', start);
  if (end < 0) {
    return undefined;
  }
  const repo = summary.slice(start, end).trim();
  return repo.length === 0 ? undefined : repo;
}

/**
 * Parses the final `(project:<value>)` marker from a normalized request summary.
 */
function resolveProjectNameFromSummary(summary: string): string | undefined {
  const marker = '(project:';
  const markerIndex = summary.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  const start = markerIndex + marker.length;
  const end = summary.indexOf(')', start);
  if (end < 0) {
    return undefined;
  }
  const project = summary.slice(start, end).trim();
  return project.length === 0 ? undefined : project;
}

/**
 * Parses the final `(direction-prompt:<value>)` marker from a summary.
 */
function resolveDirectionPromptFromSummary(
  summary: string,
): string | undefined {
  const marker = '(direction-prompt:';
  const markerIndex = summary.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  const start = markerIndex + marker.length;
  const end = summary.indexOf(')', start);
  if (end < 0) {
    return undefined;
  }
  const value = summary.slice(start, end).trim();
  return value.length === 0 ? undefined : value;
}

/**
 * Parses the final `(url:<value>)` marker from a summary.
 */
function resolveConsiderUrlFromSummary(summary: string): string | undefined {
  const encodedValue = resolveSummaryMarkerValue(summary, '(url64:');
  const decodedValue = decodeBase64UrlSummaryValue(encodedValue);
  if (decodedValue !== undefined) {
    return decodedValue;
  }
  return resolveSummaryMarkerValue(summary, '(url:');
}

/**
 * Sanitizes queued URL values before embedding them in human-readable markers.
 */
function sanitizeSummaryQueuedUrlValue(value: string): string {
  return value
    .split('(')
    .join('[')
    .split(')')
    .join(']')
    .split(':')
    .join('-')
    .split('|')
    .join('/')
    .split('\r')
    .join(' ')
    .split('\n')
    .join(' ')
    .split('\t')
    .join(' ')
    .split('`')
    .join("'")
    .trim();
}

/** Resolves one parenthesized summary marker value by prefix. */
function resolveSummaryMarkerValue(
  summary: string,
  marker: string,
): string | undefined {
  const markerIndex = summary.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  const valueStart = markerIndex + marker.length;
  const valueEnd = summary.indexOf(')', valueStart);
  if (valueEnd < 0) {
    return undefined;
  }
  const value = summary.slice(valueStart, valueEnd).trim();
  return value.length === 0 ? undefined : value;
}

/** Decodes a base64url summary value into UTF-8 text. */
function decodeBase64UrlSummaryValue(
  encodedValue: string | undefined,
): string | undefined {
  if (encodedValue === undefined) {
    return undefined;
  }
  if (!DISCORD_BASE64URL_MARKER_PATTERN.test(encodedValue)) {
    return undefined;
  }
  const decoded = Buffer.from(encodedValue, 'base64url').toString('utf8');
  const trimmed = decoded.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Builds the state key that stores immutable open-project intent context.
 */
function createOpenProjectIntentStateKey(threadId: string): string {
  return `open-project-intent:${threadId}`;
}

/**
 * Builds the state key that stores project config version for a thread scope.
 */
function createProjectConfigVersionStateKey(threadId: string): string {
  return `project-config-version:${threadId}`;
}

/**
 * Builds the state key that stores latest project settings-history metadata.
 */
function createProjectSettingsHistoryStateKey(threadId: string): string {
  return `project-settings-history:${threadId}`;
}

/**
 * Builds an append-only state key for immutable project settings-history entries.
 */
function createProjectSettingsHistoryEntryStateKey(
  threadId: string,
  requestId: string,
): string {
  return `project-settings-history-entry:${threadId}:${requestId}`;
}

/**
 * Builds the state key that stores the current lifecycle phase for a thread scope.
 */
function createProjectPhaseStateKey(threadId: string): string {
  return `project-phase:${threadId}`;
}

/**
 * Commands that remain available independent of lifecycle phase state.
 */
const phaseAgnosticAllowedActions: readonly DiscordControlAction[] = [
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
  DEVPLAT_ACTION_CANCEL_PROJECT,
  DEVPLAT_ACTION_RESUME_PROJECT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_PROJECT_SUMMARY,
  DEVPLAT_ACTION_PHASE_CONTRACT,
];

/**
 * Builds the state key that stores the current redirect direction per thread.
 */
function createDiscoveryDirectionStateKey(threadId: string): string {
  return `discovery-direction:${threadId}`;
}

/**
 * Builds the state key that stores queued `/consider` URLs for next research.
 */
function createDiscoveryConsiderQueueStateKey(threadId: string): string {
  return `discovery-consider-queue:${threadId}`;
}

/**
 * Builds the state key that stores pending spec-approval checkpoint status.
 */
function createSpecApprovalCheckpointStateKey(threadId: string): string {
  return `spec-approval-checkpoint:${threadId}`;
}

/**
 * Builds the state key that reserves a unique project identity within a repo.
 */
function createProjectIdentityStateKey(repo: string, project: string): string {
  return `project-identity:${repo.trim().toLowerCase()}:${project
    .trim()
    .toLowerCase()}`;
}

/**
 * Builds the state key that tracks pause state for a thread-scoped project run.
 */
function createThreadPauseStateKey(threadId: string): string {
  return `project-thread-paused:${threadId}`;
}

/**
 * Resolves true when a normalized summary includes the `(force:true)` marker.
 */
function resolveForceResumeFromSummary(summary: string): boolean {
  return summary.includes('(force:true)');
}

/**
 * Creates a standardized resume-preflight summary marker.
 */
function createResumeProjectPreflightSummarySuffix(
  mode: 'ready' | 'forced',
  issues: readonly string[],
): string {
  const issuesMarker = issues.length === 0 ? 'none' : issues.join('|');
  return (
    ` (preflight:${mode}` +
    ` repo-access:unknown` +
    ` branch-state:unknown` +
    ` pr-status:unknown` +
    ` gate-health:unknown` +
    ` blocker-inventory:unknown` +
    ` issues:${issuesMarker})`
  );
}

/** Detects duplicate-write errors returned by the file-store layer. */
function isAlreadyExistsStoreError(error: string): boolean {
  const normalized = error.toLowerCase();
  return normalized.includes('eexist') || normalized.includes('already exists');
}

/** Detects missing-record errors returned by the file-store layer. */
function isMissingStoreError(error: string): boolean {
  const normalized = error.toLowerCase();
  return normalized.includes('enoent') || normalized.includes('no such file');
}

/** Extracts a short storage error code token when available. */
function resolveStoreErrorCode(error: string): string | undefined {
  const normalized = error.toLowerCase();
  if (normalized.includes('eexist') || normalized.includes('already exists')) {
    return 'EEXIST';
  }
  if (
    normalized.includes('eacces') ||
    normalized.includes('permission denied')
  ) {
    return 'EACCES';
  }
  if (normalized.includes('enospc') || normalized.includes('no space left')) {
    return 'ENOSPC';
  }
  return undefined;
}

/**
 * Structured settings-history metadata stored after successful settings changes.
 */
type ProjectSettingsHistoryMetadata = {
  readonly changedBy: string;
  readonly changedKeys: string;
  readonly effectiveValuesSummary: string;
  readonly effectiveValuesDetailed: string;
};

/**
 * Hydrated settings-history markers extracted from persisted state.
 */
type HydratedProjectSettingsHistoryMarkers = {
  readonly changedAt?: string;
  readonly changedBy?: string;
  readonly changedKeys?: string;
  readonly effectiveValuesSummary?: string;
  readonly effectiveValuesDetailed?: string;
};

/**
 * Reads persisted settings-history markers for a thread scope.
 */
function resolveProjectSettingsHistoryMarkersFromPayload(
  payload: UnknownRecord,
): HydratedProjectSettingsHistoryMarkers {
  const changedAt = readTrimmedStringField(payload, 'changedAt');
  const changedBy = readTrimmedStringField(payload, 'changedBy');
  const changedKeys = readTrimmedStringField(payload, 'changedKeys');
  const effectiveValuesSummary = readTrimmedStringField(
    payload,
    'effectiveValuesSummary',
  );
  const effectiveValuesDetailed = readTrimmedStringField(
    payload,
    'effectiveValuesDetailed',
  );
  return {
    ...(changedAt === undefined ? {} : { changedAt }),
    ...(changedBy === undefined ? {} : { changedBy }),
    ...(changedKeys === undefined ? {} : { changedKeys }),
    ...(effectiveValuesSummary === undefined ? {} : { effectiveValuesSummary }),
    ...(effectiveValuesDetailed === undefined
      ? {}
      : { effectiveValuesDetailed }),
  };
}

/**
 * Appends settings-history markers to a control summary when available.
 */
function appendProjectSettingsHistoryMarkers(
  summary: string,
  markers: HydratedProjectSettingsHistoryMarkers,
  mode: 'summary' | 'detailed',
): string {
  const suffixes: string[] = [];
  if (markers.changedAt !== undefined) {
    suffixes.push(`(changed-at:${markers.changedAt})`);
  }
  if (markers.changedBy !== undefined) {
    suffixes.push(`(changed-by:${markers.changedBy})`);
  }
  if (markers.changedKeys !== undefined) {
    suffixes.push(`(changed-keys:${markers.changedKeys})`);
  }
  const effectiveValues =
    mode === 'detailed'
      ? markers.effectiveValuesDetailed
      : markers.effectiveValuesSummary;
  if (effectiveValues !== undefined) {
    suffixes.push(`(effective-values:${effectiveValues})`);
  }
  if (suffixes.length === 0) {
    return summary;
  }
  return `${summary} ${suffixes.join(' ')}`.trim();
}

/**
 * Reads a trimmed string field from a record-like payload.
 */
function readTrimmedStringField(
  payload: unknown,
  fieldName: string,
): string | undefined {
  if (!isUnknownRecord(payload)) {
    return undefined;
  }

  if (!(fieldName in payload)) {
    return undefined;
  }

  const value = payload[fieldName];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Parses numeric config version suffix from a `v<number>` marker.
 */
function parseConfigVersionNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!DISCORD_PROJECT_CONFIG_VERSION_PATTERN.test(trimmed)) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed.slice(1), 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Renders accepted control responses with artifact-specific context when needed.
 */
function renderAcceptedControlMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  return request.action === DEVPLAT_ACTION_SHOW_LAST_ARTIFACT
    ? renderDiscordArtifactMessage(request)
    : renderDiscordControlAcceptedMessage(request);
}

/** Contract for discord control response transport. */
export interface DiscordControlResponseTransport {
  postInteractionResponse(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt>;
  postInteractionDeferred(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordResponseReceipt>;
  postInteractionCompletion(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt>;
  postThreadMessage(
    threadId: string,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt>;
}

/**
 * Projects deferred-completion transport results into optional control result fields.
 */
function createDiscordCompletionResultProjection(
  result: DiscordInteractionCompletionResult,
): Partial<
  Pick<DiscordControlResult, 'completionPostError' | 'completionReceipt'>
> {
  if (result.ok) {
    return {
      completionReceipt: result.completionReceipt,
    };
  }

  if (result.completionReceipt === undefined) {
    return {
      completionPostError: result.completionPostError,
    };
  }

  return {
    completionPostError: result.completionPostError,
    completionReceipt: result.completionReceipt,
  };
}

/**
 * Projects a structured DevPlat Discord payload into a REST message body.
 */
function createDiscordRestMessageBody(
  payload: DiscordMessagePayload,
): DiscordMessagePayload {
  return {
    content: payload.content,
    ...(payload.allowed_mentions === undefined
      ? {}
      : {
          /**
           * Discord message payload wire key; renderer keeps the internal transport typed.
           */
          allowed_mentions: payload.allowed_mentions,
        }),
    ...(payload.components === undefined
      ? {}
      : { components: payload.components }),
    ...(payload.flags === undefined ? {} : { flags: payload.flags }),
  };
}

/**
 * Converts unknown transport failures into stable result text.
 */
function describeDiscordTransportError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns true when Discord accepted the REST request.
 */
function isDiscordRestSuccessStatus(statusCode: number): boolean {
  return (
    statusCode >= DISCORD_REST_SUCCESS_MIN_STATUS &&
    statusCode < DISCORD_REST_SUCCESS_MAX_EXCLUSIVE_STATUS
  );
}

/**
 * Returns true when the callback came from a Discord message component.
 */
function isDiscordComponentInteraction(
  input: DiscordOperatorInteraction,
): boolean {
  return input.customId !== undefined;
}

/**
 * Builds a stable diagnostic for rejected Discord interaction acknowledgements.
 */
function describeDiscordInteractionResponseRejection(
  receipt: DiscordResponseReceipt,
): string {
  return `Discord interaction acknowledgement returned HTTP ${String(receipt.statusCode)}.`;
}

/**
 * Builds a stable diagnostic for rejected Discord deferred acknowledgements.
 */
function describeDiscordInteractionDeferredRejection(
  receipt: DiscordResponseReceipt,
): string {
  return `Discord interaction deferred acknowledgement returned HTTP ${String(receipt.statusCode)}.`;
}

/**
 * Builds a stable diagnostic for rejected Discord interaction completion updates.
 */
function describeDiscordInteractionCompletionRejection(
  receipt: DiscordResponseReceipt,
): string {
  return `Discord interaction completion returned HTTP ${String(receipt.statusCode)}.`;
}

/**
 * Builds a stable diagnostic for rejected Discord thread status messages.
 */
function describeDiscordThreadMessageRejection(
  receipt: DiscordResponseReceipt,
): string {
  return `Discord thread status message returned HTTP ${String(receipt.statusCode)}.`;
}

/**
 * Adds a work-item projection to result payloads when one is available.
 */
function createDiscordControlResultWithOptionalWorkItem(
  result: Omit<DiscordControlResult, 'workItem'>,
  request: DiscordControlRequest,
): DiscordControlResult {
  return request.workItem === undefined
    ? result
    : {
        ...result,
        workItem: request.workItem,
      };
}

/** Discord rest response transport service. */
export class DiscordRestResponseTransport implements DiscordControlResponseTransport {
  public constructor(
    private readonly botToken = process.env['DISCORD_BOT_TOKEN'] ?? '',
    private readonly baseUrl = process.env['DISCORD_API_BASE_URL'] ??
      'https://discord.com/api/v10',
    private readonly fetchImpl = fetch,
    private readonly applicationId = process.env[
      DISCORD_APPLICATION_ID_ENVIRONMENT_VARIABLE
    ] ?? '',
  ) {}

  /** Post interaction response. */
  public async postInteractionResponse(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt> {
    const endpoint = `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`;
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: DISCORD_INTERACTION_CHANNEL_MESSAGE_RESPONSE_TYPE,
        data: createDiscordRestMessageBody(payload),
      }),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    return {
      endpoint,
      statusCode: response.status,
      responseBody,
    };
  }

  /** Post interaction deferred. */
  public async postInteractionDeferred(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordResponseReceipt> {
    const endpoint = `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`;
    const body = isDiscordComponentInteraction(input)
      ? {
          type: DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
        }
      : {
          type: DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
          data: {
            flags: DISCORD_EPHEMERAL_MESSAGE_FLAG,
          },
        };
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    return {
      endpoint,
      statusCode: response.status,
      responseBody,
    };
  }

  /** Post interaction completion. */
  public async postInteractionCompletion(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt> {
    if (this.applicationId.trim().length === 0) {
      throw new Error(
        'DISCORD_APPLICATION_ID is required for Discord interaction completion.',
      );
    }

    const endpoint = `/webhooks/${encodeURIComponent(this.applicationId)}/${encodeURIComponent(input.token)}`;
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createDiscordRestMessageBody(payload)),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    return {
      endpoint,
      statusCode: response.status,
      responseBody,
    };
  }

  /** Post thread message. */
  public async postThreadMessage(
    threadId: string,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt> {
    if (this.botToken.trim().length === 0) {
      throw new Error('DISCORD_BOT_TOKEN is required for Discord responses.');
    }

    const endpoint = `/channels/${encodeURIComponent(threadId)}/messages`;
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        authorization: `Bot ${this.botToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(createDiscordRestMessageBody(payload)),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    return {
      endpoint,
      statusCode: response.status,
      responseBody,
    };
  }
}

/** Discord loopback response transport service. */
export class DiscordLoopbackResponseTransport implements DiscordControlResponseTransport {
  /** Post interaction response. */
  public postInteractionResponse(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt> {
    return Promise.resolve({
      endpoint: `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`,
      statusCode: 200,
      responseBody: {
        mode: 'loopback',
        content: payload.content,
        payload,
        interactionId: input.id,
      },
    });
  }

  /** Post interaction deferred. */
  public postInteractionDeferred(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordResponseReceipt> {
    return Promise.resolve({
      endpoint: `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`,
      statusCode: 200,
      responseBody: {
        mode: 'loopback',
        deferred: true,
        interactionId: input.id,
      },
    });
  }

  /** Post interaction completion. */
  public postInteractionCompletion(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt> {
    return Promise.resolve({
      endpoint: `/webhooks/loopback/${encodeURIComponent(input.token)}`,
      statusCode: 200,
      responseBody: {
        mode: 'loopback',
        content: payload.content,
        payload,
        interactionId: input.id,
      },
    });
  }

  /** Post thread message. */
  public postThreadMessage(
    threadId: string,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt> {
    return Promise.resolve({
      endpoint: `/channels/${encodeURIComponent(threadId)}/messages`,
      statusCode: 200,
      responseBody: {
        mode: 'loopback',
        content: payload.content,
        payload,
        threadId,
      },
    });
  }
}

/** Discord control plane service. */
export class DiscordControlPlaneService {
  public constructor(
    private readonly policy = new DecisionPolicyService(),
    private readonly telemetry = new TelemetryEventService(),
    private readonly store = new FileStoreService(),
    private readonly responses: DiscordControlResponseTransport = new DiscordRestResponseTransport(),
  ) {}

  /** Executes the service operation. */
  public execute(input: DiscordControlRequest): DiscordControlRequest {
    return createDiscordControlRequest(input);
  }

  /** Describes the service result for operators. */
  public explain(input: DiscordControlRequest): string {
    return describeDiscordControlRequest(input);
  }

  /**
   * Returns whether thread-scoped project execution is currently paused.
   */
  private async resolveThreadPausedState(threadId: string): Promise<boolean> {
    const pausedState = await this.store.read(
      'state',
      createThreadPauseStateKey(threadId),
    );
    if (!pausedState.ok) {
      return !isMissingStoreError(pausedState.error);
    }
    const paused = pausedState.value.payload['paused'];
    return paused === true;
  }

  /**
   * Persists pause-state transitions for cancel/resume project controls.
   */
  private async persistThreadPausedState(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
  ): Promise<void> {
    if (
      !decision.allowed ||
      (request.action !== DEVPLAT_ACTION_CANCEL_PROJECT &&
        request.action !== DEVPLAT_ACTION_RESUME_PROJECT)
    ) {
      return;
    }
    const paused = request.action === DEVPLAT_ACTION_CANCEL_PROJECT;
    await this.store.store({
      id: `${request.id}:project-thread-paused`,
      key: createThreadPauseStateKey(request.threadId),
      scope: 'state',
      summary: 'Thread-scoped project pause state.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        action: request.action,
        paused,
      },
    });
  }

  /**
   * Returns true when an action can execute while the thread is paused.
   */
  private isActionAllowedWhileThreadPaused(
    action: DiscordControlRequest['action'],
  ): boolean {
    return (
      action === DEVPLAT_ACTION_SHOW_STATUS ||
      action === DEVPLAT_ACTION_SHOW_LAST_ARTIFACT ||
      action === DEVPLAT_ACTION_PROJECT_SUMMARY ||
      action === DEVPLAT_ACTION_PHASE_CONTRACT ||
      action === DEVPLAT_ACTION_RESUME_PROJECT ||
      action === DEVPLAT_ACTION_CANCEL_PROJECT
    );
  }

  /**
   * Runs resume preflight and enforces second confirmation when issues are detected.
   */
  private async enforceResumeProjectPreflight(
    request: DiscordControlRequest,
  ): Promise<
    { ok: true; summarySuffix: string } | { ok: false; reason: string }
  > {
    if (request.action !== DEVPLAT_ACTION_RESUME_PROJECT) {
      return { ok: true, summarySuffix: '' };
    }
    const threadPaused = await this.resolveThreadPausedState(request.threadId);
    const preflightIssues: string[] = [];
    if (!threadPaused) {
      preflightIssues.push('thread-not-paused');
    }
    if (preflightIssues.length === 0) {
      return {
        ok: true,
        summarySuffix: createResumeProjectPreflightSummarySuffix(
          'ready',
          preflightIssues,
        ),
      };
    }
    if (resolveForceResumeFromSummary(request.summary)) {
      return {
        ok: true,
        summarySuffix: createResumeProjectPreflightSummarySuffix(
          'forced',
          preflightIssues,
        ),
      };
    }
    return {
      ok: false,
      reason:
        `resume preflight requires second confirmation: issues=${preflightIssues.join('|')}. ` +
        'Run /resume-project --force force to acknowledge and continue.',
    };
  }

  /**
   * Returns the phase-allowed command surface for thread-level lifecycle gating.
   */
  private resolveAllowedActionsForPhase(
    phase: string,
  ): readonly DiscordControlAction[] {
    switch (phase) {
      case 'Spec Draft':
        return [
          ...phaseAgnosticAllowedActions,
          DEVPLAT_ACTION_RESEARCH,
          DEVPLAT_ACTION_REDIRECT,
          DEVPLAT_ACTION_CONSIDER,
          DEVPLAT_ACTION_ALTERNATIVES,
          DEVPLAT_ACTION_SPEC,
          DEVPLAT_ACTION_CANCEL_PROJECT,
        ];
      case 'Spec Refinement/Approval':
        return [
          ...phaseAgnosticAllowedActions,
          DEVPLAT_ACTION_RESEARCH,
          DEVPLAT_ACTION_REDIRECT,
          DEVPLAT_ACTION_CONSIDER,
          DEVPLAT_ACTION_ALTERNATIVES,
          DEVPLAT_ACTION_SPEC,
          DEVPLAT_ACTION_APPROVE_THIS,
          DEVPLAT_ACTION_CANCEL_PROJECT,
        ];
      case 'Slicing':
      case 'Slicing Refinement/Approval':
        return [
          ...phaseAgnosticAllowedActions,
          DEVPLAT_ACTION_APPROVE_THIS,
          DEVPLAT_ACTION_RUN_THIS,
          DEVPLAT_ACTION_CANCEL_PROJECT,
        ];
      case 'Slice Implementation':
        return [
          ...phaseAgnosticAllowedActions,
          DEVPLAT_ACTION_RUN_THIS,
          DEVPLAT_ACTION_CLAIM_THIS,
          DEVPLAT_ACTION_COMPLETE_THIS,
          DEVPLAT_ACTION_BLOCK_THIS,
          DEVPLAT_ACTION_PAUSE_THIS,
          DEVPLAT_ACTION_RESUME_THIS,
          DEVPLAT_ACTION_RETRY_GATES,
          DEVPLAT_ACTION_APPROVE_THIS,
          DEVPLAT_ACTION_CANCEL_PROJECT,
        ];
      case 'Slice PR Review':
      case 'Slice PR Creation':
      case 'Slice Approval Request':
        return [
          ...phaseAgnosticAllowedActions,
          DEVPLAT_ACTION_APPROVE_THIS,
          DEVPLAT_ACTION_MERGE_NOW,
          DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
          DEVPLAT_ACTION_SYNC_WORKTREE,
          DEVPLAT_ACTION_RELEASE_WORKTREE,
          DEVPLAT_ACTION_CANCEL_PROJECT,
        ];
      case 'Slice PR Merge':
        return [
          ...phaseAgnosticAllowedActions,
          DEVPLAT_ACTION_MERGE_NOW,
          DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
          DEVPLAT_ACTION_SYNC_WORKTREE,
          DEVPLAT_ACTION_RELEASE_WORKTREE,
          DEVPLAT_ACTION_RELEASE_PROJECT,
          DEVPLAT_ACTION_CANCEL_PROJECT,
        ];
      case 'Next Slice or Release':
      case 'Completion':
        return [
          ...phaseAgnosticAllowedActions,
          DEVPLAT_ACTION_RUN_THIS,
          DEVPLAT_ACTION_RELEASE_PROJECT,
          DEVPLAT_ACTION_SPEC,
          DEVPLAT_ACTION_RESEARCH,
          DEVPLAT_ACTION_CANCEL_PROJECT,
        ];
      default:
        return phaseAgnosticAllowedActions;
    }
  }

  /**
   * Enforces phase-appropriate command usage when lifecycle phase is known.
   */
  private async enforcePhaseActionCompatibility(
    request: DiscordControlRequest,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const phaseState = await this.store.read(
      'state',
      createProjectPhaseStateKey(request.threadId),
    );
    if (!phaseState.ok) {
      if (!isMissingStoreError(phaseState.error)) {
        return {
          ok: false,
          reason:
            'unable to verify lifecycle phase compatibility for this thread. ' +
            'Retry after storage recovers.',
        };
      }
      return { ok: true };
    }
    const phase = readTrimmedStringField(phaseState.value.payload, 'phase');
    if (phase === undefined) {
      return { ok: true };
    }
    const allowedActions = this.resolveAllowedActionsForPhase(phase);
    if (allowedActions.includes(request.action)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        `action ${request.action} is not allowed in phase ${phase}. ` +
        'Use /phase-contract to view allowed commands for this thread.',
    };
  }

  /**
   * Reads persisted project metadata used by status and summary responses.
   */
  private async resolveThreadProjectMetadata(
    threadId: string,
  ): Promise<{ intent?: string; configVersion?: string; phase?: string }> {
    const [intentState, configVersionState, phaseState] = await Promise.all([
      this.store.read('state', createOpenProjectIntentStateKey(threadId)),
      this.store.read('state', createProjectConfigVersionStateKey(threadId)),
      this.store.read('state', createProjectPhaseStateKey(threadId)),
    ]);

    const intentPayload = intentState.ok
      ? intentState.value.payload
      : undefined;
    const intent = readTrimmedStringField(intentPayload, 'intent');

    const configPayload = configVersionState.ok
      ? configVersionState.value.payload
      : undefined;
    const configVersion = readTrimmedStringField(
      configPayload,
      'configVersion',
    );
    const phasePayload = phaseState.ok ? phaseState.value.payload : undefined;
    const phase = readTrimmedStringField(phasePayload, 'phase');

    return {
      ...(intent === undefined || intent.length === 0 ? {} : { intent }),
      ...(configVersion === undefined || configVersion.length === 0
        ? {}
        : { configVersion }),
      ...(phase === undefined || phase.length === 0 ? {} : { phase }),
    };
  }

  /**
   * Injects persisted intent/config markers into status and project-summary requests.
   */
  private async hydrateRequestSummaryMetadata(
    request: DiscordControlRequest,
  ): Promise<DiscordControlRequest> {
    if (request.action === DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY) {
      const settingsHistoryState = await this.store.read(
        'state',
        createProjectSettingsHistoryStateKey(request.threadId),
      );
      if (!settingsHistoryState.ok) {
        return request;
      }
      const markers = resolveProjectSettingsHistoryMarkersFromPayload(
        settingsHistoryState.value.payload,
      );
      const historyMode: 'summary' | 'detailed' = request.summary.includes(
        '(mode:detailed)',
      )
        ? 'detailed'
        : 'summary';

      return {
        ...request,
        summary: appendProjectSettingsHistoryMarkers(
          request.summary,
          markers,
          historyMode,
        ),
      };
    }

    if (
      request.action !== DEVPLAT_ACTION_SHOW_STATUS &&
      request.action !== DEVPLAT_ACTION_PROJECT_SUMMARY &&
      request.action !== DEVPLAT_ACTION_SHOW_LAST_ARTIFACT
    ) {
      return request;
    }

    const metadata = await this.resolveThreadProjectMetadata(request.threadId);
    const intentMarker =
      metadata.intent === undefined ? '' : ` (intent:${metadata.intent})`;
    const configMarker =
      metadata.configVersion === undefined
        ? ''
        : ` (config-version:${metadata.configVersion})`;
    const phaseMarker =
      metadata.phase === undefined ? '' : ` (phase:${metadata.phase})`;

    return {
      ...request,
      summary:
        `${request.summary}${intentMarker}${configMarker}${phaseMarker}`.trim(),
    };
  }

  /**
   * Advances and persists config version on successful project-settings mutations.
   */
  private async persistProjectConfigVersion(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
  ): Promise<string | undefined> {
    if (
      request.action !== DEVPLAT_ACTION_PROJECT_SETTINGS ||
      !decision.allowed
    ) {
      return undefined;
    }

    const stateKey = createProjectConfigVersionStateKey(request.threadId);
    const previous = await this.store.read('state', stateKey);
    const previousPayload = previous.ok ? previous.value.payload : undefined;
    const previousVersion =
      readTrimmedStringField(previousPayload, 'configVersion') ?? 'v0';
    const nextNumber = (parseConfigVersionNumber(previousVersion) ?? 0) + 1;
    const nextVersion = `v${String(nextNumber)}`;

    await this.store.store({
      id: `${request.id}:project-config-version`,
      key: stateKey,
      scope: 'state',
      summary: 'Project config version.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        action: request.action,
        configVersion: nextVersion,
      },
    });
    return nextVersion;
  }

  /**
   * Persists latest settings-history metadata after successful settings updates.
   */
  private async persistProjectSettingsHistoryState(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
    configVersion: string | undefined,
  ): Promise<void> {
    if (
      request.action !== DEVPLAT_ACTION_PROJECT_SETTINGS ||
      !decision.allowed ||
      configVersion === undefined
    ) {
      return;
    }

    const summaryMetadata: ProjectSettingsHistoryMetadata = {
      changedBy: request.actorId,
      changedKeys: 'unknown',
      effectiveValuesSummary: 'sensitive values redacted',
      effectiveValuesDetailed: 'unavailable',
    };
    const historyPayload = {
      threadId: request.threadId,
      action: request.action,
      configVersion,
      changedAt: request.updatedAt,
      changedBy: summaryMetadata.changedBy,
      changedKeys: summaryMetadata.changedKeys,
      effectiveValuesSummary: summaryMetadata.effectiveValuesSummary,
      effectiveValuesDetailed: summaryMetadata.effectiveValuesDetailed,
    };

    await this.store.store({
      id: `${request.id}:project-settings-history-entry`,
      key: createProjectSettingsHistoryEntryStateKey(
        request.threadId,
        request.id,
      ),
      scope: 'state',
      summary: 'Project settings history immutable entry.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: historyPayload,
    });

    await this.store.store({
      id: `${request.id}:project-settings-history`,
      key: createProjectSettingsHistoryStateKey(request.threadId),
      scope: 'state',
      summary: 'Project settings history metadata.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: historyPayload,
    });
  }

  /**
   * Persists thread-scoped redirect direction and returns enriched summary markers.
   */
  private async persistRedirectDirectionState(
    request: DiscordControlRequest,
  ): Promise<DiscordControlRequest> {
    const nextDirection = resolveDirectionPromptFromSummary(request.summary);
    if (nextDirection === undefined) {
      return request;
    }
    const stateKey = createDiscoveryDirectionStateKey(request.threadId);
    const previousDirectionState = await this.store.read('state', stateKey);
    const previousDirection = previousDirectionState.ok
      ? readTrimmedStringField(
          previousDirectionState.value.payload,
          'directionPrompt',
        )
      : undefined;

    await this.store.store({
      id: `${request.id}:discovery-direction`,
      key: stateKey,
      scope: 'state',
      summary: 'Discovery direction state.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        action: request.action,
        directionPrompt: nextDirection,
        ...(previousDirection === undefined
          ? {}
          : { previousDirectionPrompt: previousDirection }),
      },
    });

    const previousDirectionSuffix =
      previousDirection === undefined
        ? ''
        : ` (previous-direction:${previousDirection})`;
    return {
      ...request,
      summary: `${request.summary}${previousDirectionSuffix}`.trim(),
    };
  }

  /**
   * Persists consider queue updates and returns enriched queue-count markers.
   */
  private async persistConsiderQueueState(
    request: DiscordControlRequest,
  ): Promise<DiscordControlRequest> {
    const queuedUrl = resolveConsiderUrlFromSummary(request.summary);
    if (queuedUrl === undefined) {
      return request;
    }
    const stateKey = createDiscoveryConsiderQueueStateKey(request.threadId);
    const previousQueueState = await this.store.read('state', stateKey);
    const rawQueuedUrls = previousQueueState.ok
      ? previousQueueState.value.payload['queuedUrls']
      : undefined;
    const queuedUrls = Array.isArray(rawQueuedUrls)
      ? rawQueuedUrls
          .filter((entry) => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [];
    const updatedQueuedUrls = [...queuedUrls, queuedUrl];

    await this.store.store({
      id: `${request.id}:discovery-consider-queue`,
      key: stateKey,
      scope: 'state',
      summary: 'Discovery consider queue.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        action: request.action,
        queuedUrls: updatedQueuedUrls,
      },
    });

    return {
      ...request,
      summary:
        `${request.summary} (queued-count:${String(updatedQueuedUrls.length)})`.trim(),
    };
  }

  /**
   * Flushes queued consider URLs into the next research cycle summary.
   */
  private async flushConsiderQueueForResearch(
    request: DiscordControlRequest,
  ): Promise<DiscordControlRequest> {
    const stateKey = createDiscoveryConsiderQueueStateKey(request.threadId);
    const queueState = await this.store.read('state', stateKey);
    if (!queueState.ok) {
      return request;
    }
    const rawQueuedUrls = queueState.value.payload['queuedUrls'];
    const queuedUrls = Array.isArray(rawQueuedUrls)
      ? rawQueuedUrls
          .filter((entry) => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [];
    await this.store.store({
      id: `${request.id}:discovery-consider-queue-flush`,
      key: stateKey,
      scope: 'state',
      summary: 'Discovery consider queue.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        action: request.action,
        queuedUrls: [],
      },
    });

    return {
      ...request,
      summary:
        queuedUrls.length === 0
          ? request.summary
          : `${request.summary} (considered-urls:${queuedUrls
              .map((entry) => sanitizeSummaryQueuedUrlValue(entry))
              .join('|')})`,
    };
  }

  /**
   * Persists discovery redirect direction and consider queue state.
   */
  private async persistDiscoveryResearchState(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
  ): Promise<DiscordControlRequest> {
    if (!decision.allowed) {
      return request;
    }

    if (request.action === DEVPLAT_ACTION_REDIRECT) {
      return this.persistRedirectDirectionState(request);
    }

    if (request.action === DEVPLAT_ACTION_CONSIDER) {
      return this.persistConsiderQueueState(request);
    }

    if (request.action === DEVPLAT_ACTION_RESEARCH) {
      return this.flushConsiderQueueForResearch(request);
    }

    return request;
  }

  /**
   * Persists spec-approval checkpoint state and clears stale checkpoints on new research inputs.
   */
  private async persistSpecApprovalLifecycleState(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
  ): Promise<DiscordControlRequest> {
    if (!decision.allowed) {
      return request;
    }

    const stateKey = createSpecApprovalCheckpointStateKey(request.threadId);
    if (request.action === DEVPLAT_ACTION_SPEC) {
      await this.store.store({
        id: `${request.id}:spec-approval-checkpoint`,
        key: stateKey,
        scope: 'state',
        summary: 'Spec approval checkpoint state.',
        status: 'approved',
        trace: request.trace,
        updatedAt: request.updatedAt,
        payload: {
          threadId: request.threadId,
          action: request.action,
          pending: true,
        },
      });
      return {
        ...request,
        summary: `${request.summary} (spec-approval:pending)`,
      };
    }

    if (
      request.action !== DEVPLAT_ACTION_RESEARCH &&
      request.action !== DEVPLAT_ACTION_REDIRECT &&
      request.action !== DEVPLAT_ACTION_CONSIDER &&
      request.action !== DEVPLAT_ACTION_ALTERNATIVES
    ) {
      return request;
    }

    const checkpointState = await this.store.read('state', stateKey);
    if (!checkpointState.ok) {
      return request;
    }

    if (checkpointState.value.payload['pending'] !== true) {
      return request;
    }

    await this.store.store({
      id: `${request.id}:spec-approval-checkpoint-clear`,
      key: stateKey,
      scope: 'state',
      summary: 'Spec approval checkpoint state.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        action: request.action,
        pending: false,
        clearedByAction: request.action,
      },
    });

    return {
      ...request,
      summary: `${request.summary} (stale-spec-approval:cleared)`,
    };
  }

  /**
   * Resolves lifecycle phase label for a persisted control action.
   */
  private resolveLifecyclePhaseForAction(
    request: DiscordControlRequest,
  ): string | undefined {
    if (
      request.action === DEVPLAT_ACTION_NEW_PROJECT ||
      request.action === DEVPLAT_ACTION_OPEN_PROJECT ||
      request.action === DEVPLAT_ACTION_RESEARCH ||
      request.action === DEVPLAT_ACTION_REDIRECT ||
      request.action === DEVPLAT_ACTION_CONSIDER ||
      request.action === DEVPLAT_ACTION_ALTERNATIVES
    ) {
      return 'Spec Draft';
    }
    if (request.action === DEVPLAT_ACTION_SPEC) {
      return 'Spec Refinement/Approval';
    }
    if (request.action === DEVPLAT_ACTION_RELEASE_PROJECT) {
      return 'Next Slice or Release';
    }
    if (
      request.action === DEVPLAT_ACTION_RUN_THIS ||
      request.action === DEVPLAT_ACTION_CLAIM_THIS ||
      request.action === DEVPLAT_ACTION_COMPLETE_THIS ||
      request.action === DEVPLAT_ACTION_BLOCK_THIS ||
      request.action === DEVPLAT_ACTION_PAUSE_THIS ||
      request.action === DEVPLAT_ACTION_RESUME_THIS ||
      request.action === DEVPLAT_ACTION_RETRY_GATES
    ) {
      return request.workItem?.threadKind === 'pull-request'
        ? 'Slice PR Review'
        : 'Slice Implementation';
    }
    if (
      request.action === DEVPLAT_ACTION_MERGE_NOW ||
      request.action === DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS ||
      request.action === DEVPLAT_ACTION_SYNC_WORKTREE ||
      request.action === DEVPLAT_ACTION_RELEASE_WORKTREE
    ) {
      return 'Slice PR Merge';
    }
    if (request.action === DEVPLAT_ACTION_APPROVE_THIS) {
      if (request.workItem?.threadKind === 'pull-request') {
        return 'Slice PR Merge';
      }
      if (request.workItem?.threadKind === 'implementation') {
        return 'Slice Implementation';
      }
      return 'Slicing';
    }
    return undefined;
  }

  /**
   * Persists thread-scoped lifecycle phase transitions for status/reporting.
   */
  private async persistLifecyclePhaseState(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
  ): Promise<void> {
    if (!decision.allowed) {
      return;
    }
    const phase = this.resolveLifecyclePhaseForAction(request);
    if (phase === undefined) {
      return;
    }
    await this.store.store({
      id: `${request.id}:project-phase`,
      key: createProjectPhaseStateKey(request.threadId),
      scope: 'state',
      summary: 'Project lifecycle phase.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        action: request.action,
        phase,
      },
    });
  }

  /**
   * Records a blocked audit and returns a fail-closed control result.
   */
  private async failClosedWithAudit(
    request: DiscordControlRequest,
    reason: string,
    resultStatus: string,
  ): Promise<DiscordControlResult> {
    await this.telemetry.recordAudit({
      auditId: `${request.id}:audit`,
      runId: request.id,
      eventId: request.id,
      actorId: request.actorId,
      action: request.action,
      scope: 'discord',
      outcome: 'blocked',
      reason,
      artifactIds:
        request.workItem?.artifactId === undefined
          ? []
          : [request.workItem.artifactId],
      recordedAt: request.updatedAt,
      policyDecisionId: 'discord-fail-closed',
      details: {
        threadId: request.threadId,
        channelId: request.channelId,
        resultStatus,
        correlationId: request.id,
      },
    });
    return createDiscordControlResultWithOptionalWorkItem(
      {
        request,
        policyDecisionId: 'discord-fail-closed',
        allowed: false,
        persistedKey: request.id,
        failedClosed: true,
        blockedReason: reason,
      },
      request,
    );
  }

  /**
   * Enforces immutable `/open-project --intent` context for a thread scope.
   */
  private async enforceOpenProjectIntentImmutability(
    request: DiscordControlRequest,
  ): Promise<
    | { ok: true; persistIntent?: string; stateKey?: string }
    | { ok: false; reason: string }
  > {
    if (request.action !== DEVPLAT_ACTION_OPEN_PROJECT) {
      return { ok: true };
    }

    const currentIntent = resolveOpenProjectIntentFromSummary(request.summary);
    if (currentIntent === undefined) {
      return {
        ok: false,
        reason:
          'open-project intent is required and immutable for a reopened run.',
      };
    }

    const stateKey = createOpenProjectIntentStateKey(request.threadId);
    const previous = await this.store.read('state', stateKey);
    if (!previous.ok) {
      if (!isMissingStoreError(previous.error)) {
        return {
          ok: false,
          reason:
            'unable to verify immutable open-project intent for this thread. ' +
            'Use /show-status and retry after storage recovers.',
        };
      }
      return {
        ok: true,
        persistIntent: currentIntent,
        stateKey,
      };
    }

    const payload = previous.value.payload;
    const intent = readTrimmedStringField(payload, 'intent');
    if (intent === undefined || intent === currentIntent) {
      return {
        ok: true,
        persistIntent: currentIntent,
        stateKey,
      };
    }

    return {
      ok: false,
      reason: `open-project intent is immutable for this run: expected ${intent}, received ${currentIntent}.`,
    };
  }

  /**
   * Enforces project-name uniqueness per repo for `/new-project`.
   */
  private async enforceNewProjectIdentityUniqueness(
    request: DiscordControlRequest,
  ): Promise<
    | {
        ok: true;
        persistRepo?: string;
        persistProject?: string;
        stateKey?: string;
      }
    | { ok: false; reason: string }
  > {
    if (request.action !== DEVPLAT_ACTION_NEW_PROJECT) {
      return { ok: true };
    }

    const repo = resolveProjectRepoFromSummary(request.summary);
    const project = resolveProjectNameFromSummary(request.summary);
    if (repo === undefined || project === undefined) {
      return {
        ok: false,
        reason:
          'new-project requires immutable repo/project identity markers for uniqueness enforcement.',
      };
    }

    const stateKey = createProjectIdentityStateKey(repo, project);
    const previous = await this.store.read('state', stateKey);
    if (!previous.ok) {
      if (!isMissingStoreError(previous.error)) {
        return {
          ok: false,
          reason:
            'unable to verify immutable new-project identity for this thread. ' +
            'Use /show-status and retry after storage recovers.',
        };
      }
      return {
        ok: true,
        persistRepo: repo,
        persistProject: project,
        stateKey,
      };
    }

    const payload = previous.value.payload;
    const boundThreadId = readTrimmedStringField(payload, 'threadId');
    if (boundThreadId === request.threadId) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `new-project identity already exists: repo=${repo} project=${project} boundThread=${boundThreadId ?? 'unknown'}.`,
    };
  }

  /**
   * Persists a `/new-project` identity reservation with atomic create semantics.
   */
  private async persistNewProjectIdentityReservation(
    request: DiscordControlRequest,
    identityUniqueness: {
      readonly persistRepo?: string;
      readonly persistProject?: string;
      readonly stateKey?: string;
    },
  ): Promise<DiscordControlResult | undefined> {
    if (
      request.action !== DEVPLAT_ACTION_NEW_PROJECT ||
      identityUniqueness.persistRepo === undefined ||
      identityUniqueness.persistProject === undefined ||
      identityUniqueness.stateKey === undefined
    ) {
      return undefined;
    }
    const identityReservation = await this.store.storeIfAbsent({
      id: identityUniqueness.stateKey,
      key: identityUniqueness.stateKey,
      scope: 'state',
      summary: 'Project identity reservation.',
      status: 'approved',
      trace: request.trace,
      updatedAt: request.updatedAt,
      payload: {
        repo: identityUniqueness.persistRepo,
        project: identityUniqueness.persistProject,
        threadId: request.threadId,
        action: request.action,
      },
    });
    if (identityReservation.ok) {
      return undefined;
    }
    const errorCode = resolveStoreErrorCode(identityReservation.error);
    let fallbackReason = `new-project identity reservation failed: repo=${identityUniqueness.persistRepo} project=${identityUniqueness.persistProject}.`;
    if (isAlreadyExistsStoreError(identityReservation.error)) {
      fallbackReason = `new-project identity already exists: repo=${identityUniqueness.persistRepo} project=${identityUniqueness.persistProject}.`;
    } else if (errorCode !== undefined) {
      fallbackReason =
        `new-project identity reservation failed: repo=${identityUniqueness.persistRepo} ` +
        `project=${identityUniqueness.persistProject} code=${errorCode}.`;
    }
    return this.failClosedWithAudit(
      request,
      fallbackReason,
      'duplicate-project-identity',
    );
  }

  /** Handle action. */
  public async handleAction(
    input: DiscordControlRequest,
  ): Promise<DiscordControlResult> {
    const request = this.execute(input);
    return this.handleNormalizedAction(request);
  }

  /**
   * Handles a normalized control request through the shared enforcement pipeline.
   */
  private async handleNormalizedAction(
    request: DiscordControlRequest,
  ): Promise<DiscordControlResult> {
    const immutability =
      await this.enforceOpenProjectIntentImmutability(request);
    if (!immutability.ok) {
      return this.failClosedWithAudit(
        request,
        immutability.reason,
        'intent-mismatch',
      );
    }
    const decision = this.policy.evaluateControlAction(
      request.action,
      request.privileged,
    );
    const threadPaused = await this.resolveThreadPausedState(request.threadId);
    if (
      threadPaused &&
      !this.isActionAllowedWhileThreadPaused(request.action)
    ) {
      return this.failClosedWithAudit(
        request,
        'project thread is paused: run /resume-project to continue mutating actions.',
        'thread-paused',
      );
    }
    const phaseCompatibility =
      await this.enforcePhaseActionCompatibility(request);
    if (!phaseCompatibility.ok) {
      return this.failClosedWithAudit(
        request,
        phaseCompatibility.reason,
        'phase-action-mismatch',
      );
    }
    const resumePreflight = await this.enforceResumeProjectPreflight(request);
    if (!resumePreflight.ok) {
      return this.failClosedWithAudit(
        request,
        resumePreflight.reason,
        'resume-preflight-blocked',
      );
    }
    const requestWithPreflightSummary =
      resumePreflight.summarySuffix.length === 0
        ? request
        : {
            ...request,
            summary:
              `${request.summary}${resumePreflight.summarySuffix}`.trim(),
          };
    const identityUniqueness = await this.enforceNewProjectIdentityUniqueness(
      requestWithPreflightSummary,
    );
    if (!identityUniqueness.ok) {
      return this.failClosedWithAudit(
        requestWithPreflightSummary,
        identityUniqueness.reason,
        'duplicate-project-identity',
      );
    }
    if (
      request.action === DEVPLAT_ACTION_OPEN_PROJECT &&
      decision.allowed &&
      immutability.persistIntent !== undefined &&
      immutability.stateKey !== undefined
    ) {
      await this.store.store({
        id: `${request.id}:open-project-intent`,
        key: immutability.stateKey,
        scope: 'state',
        summary: 'Open-project immutable intent binding.',
        status: 'approved',
        trace: request.trace,
        updatedAt: request.updatedAt,
        payload: {
          threadId: requestWithPreflightSummary.threadId,
          action: requestWithPreflightSummary.action,
          intent: immutability.persistIntent,
        },
      });
    }
    if (decision.allowed) {
      const identityFailure = await this.persistNewProjectIdentityReservation(
        requestWithPreflightSummary,
        identityUniqueness,
      );
      if (identityFailure !== undefined) {
        return identityFailure;
      }
    }
    const requestWithDiscoveryState = await this.persistDiscoveryResearchState(
      requestWithPreflightSummary,
      decision,
    );
    const requestWithSpecApprovalLifecycle =
      await this.persistSpecApprovalLifecycleState(
        requestWithDiscoveryState,
        decision,
      );
    await this.persistLifecyclePhaseState(
      requestWithSpecApprovalLifecycle,
      decision,
    );
    await this.persistThreadPausedState(
      requestWithSpecApprovalLifecycle,
      decision,
    );

    return this.persistAction(requestWithSpecApprovalLifecycle, decision);
  }

  /**
   * Persists a policy-evaluated control action and its audit trail.
   */
  private async persistAction(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
  ): Promise<DiscordControlResult> {
    const payload =
      request.workItem === undefined
        ? {
            threadId: request.threadId,
            channelId: request.channelId,
            action: request.action,
            policyDecisionId: decision.id,
          }
        : {
            threadId: request.threadId,
            channelId: request.channelId,
            action: request.action,
            policyDecisionId: decision.id,
            workItem: request.workItem,
          };

    await this.store.store({
      id: request.id,
      key: request.id,
      scope: 'state',
      summary: request.summary,
      status: decision.allowed ? 'approved' : 'review',
      trace: [...request.trace, ...decision.trace],
      updatedAt: request.updatedAt,
      payload,
    });

    const details =
      request.workItem === undefined
        ? {
            threadId: request.threadId,
            channelId: request.channelId,
            policyDecisionId: decision.id,
            allowed: decision.allowed,
          }
        : {
            threadId: request.threadId,
            channelId: request.channelId,
            policyDecisionId: decision.id,
            allowed: decision.allowed,
            workItem: request.workItem,
          };

    await this.telemetry.record({
      id: request.id,
      summary: request.summary,
      status: decision.allowed ? 'approved' : 'review',
      trace: request.trace,
      updatedAt: request.updatedAt,
      actorId: request.actorId,
      action: request.action,
      scope: 'discord',
      details,
    });

    await this.telemetry.recordAudit({
      auditId: `${request.id}:audit`,
      runId: request.id,
      eventId: request.id,
      actorId: request.actorId,
      action: request.action,
      scope: 'discord',
      outcome: decision.allowed ? 'approved' : 'blocked',
      reason: decision.allowed
        ? `Discord action ${request.action} accepted.`
        : `Discord action ${request.action} blocked by policy.`,
      artifactIds:
        request.workItem?.artifactId === undefined
          ? []
          : [request.workItem.artifactId],
      recordedAt: request.updatedAt,
      policyDecisionId: decision.id,
      details,
    });
    const configVersion = await this.persistProjectConfigVersion(
      request,
      decision,
    );
    await this.persistProjectSettingsHistoryState(
      request,
      decision,
      configVersion,
    );

    const result = {
      request,
      policyDecisionId: decision.id,
      allowed: decision.allowed,
      persistedKey: request.id,
      failedClosed: false,
    };

    return request.workItem === undefined
      ? result
      : {
          ...result,
          workItem: request.workItem,
        };
  }

  /**
   * Posts the bound-thread copy without losing the already-sent acknowledgement.
   */
  private async postThreadMessageAfterAcknowledgement(
    threadId: string,
    payload: DiscordMessagePayload,
  ): Promise<DiscordThreadPostResult> {
    try {
      const threadReceipt = await this.responses.postThreadMessage(
        threadId,
        payload,
      );

      if (isDiscordRestSuccessStatus(threadReceipt.statusCode)) {
        return {
          ok: true,
          threadReceipt,
        };
      }

      return {
        ok: false,
        threadReceipt,
        threadPostError: describeDiscordThreadMessageRejection(threadReceipt),
      };
    } catch (error) {
      return {
        ok: false,
        threadPostError: describeDiscordTransportError(error),
      };
    }
  }

  /**
   * Posts the initial acknowledgement and converts transport failures into data.
   */
  private async postInteractionAcknowledgement(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordInteractionAcknowledgementResult> {
    try {
      const responseReceipt = await this.responses.postInteractionResponse(
        input,
        payload,
      );

      return isDiscordRestSuccessStatus(responseReceipt.statusCode)
        ? {
            ok: true,
            responseReceipt,
          }
        : {
            ok: false,
            responseReceipt,
            responsePostError:
              describeDiscordInteractionResponseRejection(responseReceipt),
          };
    } catch (error) {
      return {
        ok: false,
        responsePostError: describeDiscordTransportError(error),
      };
    }
  }

  /**
   * Defers the initial acknowledgement for routed actions before thread updates.
   */
  private async postInteractionDeferredAcknowledgement(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordInteractionAcknowledgementResult> {
    try {
      const responseReceipt =
        await this.responses.postInteractionDeferred(input);

      return isDiscordRestSuccessStatus(responseReceipt.statusCode)
        ? {
            ok: true,
            responseReceipt,
          }
        : {
            ok: false,
            responseReceipt,
            responsePostError:
              describeDiscordInteractionDeferredRejection(responseReceipt),
          };
    } catch (error) {
      return {
        ok: false,
        responsePostError: describeDiscordTransportError(error),
      };
    }
  }

  /**
   * Completes a deferred Discord interaction after the thread result is posted.
   */
  private async postInteractionCompletion(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordInteractionCompletionResult> {
    try {
      const completionReceipt = await this.responses.postInteractionCompletion(
        input,
        payload,
      );

      return isDiscordRestSuccessStatus(completionReceipt.statusCode)
        ? {
            ok: true,
            completionReceipt,
          }
        : {
            ok: false,
            completionReceipt,
            completionPostError:
              describeDiscordInteractionCompletionRejection(completionReceipt),
          };
    } catch (error) {
      return {
        ok: false,
        completionPostError: describeDiscordTransportError(error),
      };
    }
  }

  /**
   * Records an audit event when Discord rejects the initial acknowledgement.
   */
  private async recordInteractionResponseFailure(
    request: DiscordControlRequest,
    policyDecisionId: string,
    responsePostError: string,
    responseReceipt?: DiscordResponseReceipt,
  ): Promise<void> {
    await this.telemetry.recordAudit({
      auditId: `${request.id}:audit`,
      runId: request.id,
      eventId: request.id,
      actorId: request.actorId,
      action: request.action,
      scope: 'discord',
      outcome: 'blocked',
      reason: responsePostError,
      artifactIds:
        request.workItem?.artifactId === undefined
          ? []
          : [request.workItem.artifactId],
      recordedAt: request.updatedAt,
      policyDecisionId,
      details:
        request.workItem === undefined
          ? {
              threadId: request.threadId,
              channelId: request.channelId,
              resultStatus: 'response-rejected',
              correlationId: request.id,
              ...(responseReceipt === undefined
                ? {}
                : { responseStatusCode: responseReceipt.statusCode }),
            }
          : {
              threadId: request.threadId,
              channelId: request.channelId,
              resultStatus: 'response-rejected',
              correlationId: request.id,
              ...(responseReceipt === undefined
                ? {}
                : { responseStatusCode: responseReceipt.statusCode }),
              workItem: request.workItem,
            },
    });
  }

  /**
   * Handles an interaction that failed route validation before policy checks.
   */
  private async handleInteractionRouteFailure(
    input: DiscordOperatorInteraction,
    reason: string,
  ): Promise<DiscordControlResult> {
    const responsePayload = renderDiscordRouteFailureMessage(input, reason);
    const request = createDiscordControlRequest({
      id: input.id,
      summary: reason,
      status: 'blocked',
      trace: [],
      updatedAt: input.updatedAt,
      actorId: input.actorId,
      threadId: 'unresolved',
      channelId: input.channelId,
      action: DEVPLAT_ACTION_SHOW_STATUS,
      privileged: false,
    });
    const acknowledgement = await this.postInteractionAcknowledgement(
      input,
      responsePayload,
    );
    const auditReason = acknowledgement.ok
      ? reason
      : acknowledgement.responsePostError;
    await this.telemetry.recordAudit({
      auditId: `${input.id}:audit`,
      runId: input.id,
      eventId: input.id,
      actorId: input.actorId,
      action: DEVPLAT_ACTION_SHOW_STATUS,
      scope: 'discord',
      outcome: 'blocked',
      reason: auditReason,
      artifactIds: [],
      recordedAt: input.updatedAt,
      policyDecisionId: 'discord-fail-closed',
      details: {
        threadId: 'unresolved',
        channelId: input.channelId,
        resultStatus: acknowledgement.ok ? 'refused' : 'response-rejected',
        correlationId: input.id,
        ...(acknowledgement.ok || acknowledgement.responseReceipt === undefined
          ? {}
          : {
              responseStatusCode: acknowledgement.responseReceipt.statusCode,
            }),
      },
    });

    return {
      request,
      policyDecisionId: 'discord-fail-closed',
      allowed: false,
      persistedKey: input.id,
      responsePayload,
      failedClosed: true,
      ...(acknowledgement.ok
        ? { responseReceipt: acknowledgement.responseReceipt }
        : {
            responsePostError: acknowledgement.responsePostError,
            ...(acknowledgement.responseReceipt === undefined
              ? {}
              : { responseReceipt: acknowledgement.responseReceipt }),
          }),
    };
  }

  /**
   * Handles a routed interaction after thread context has resolved.
   */
  private async handleRoutedInteraction(
    input: DiscordOperatorInteraction,
    request: DiscordControlRequest,
  ): Promise<DiscordControlResult> {
    const immutability =
      await this.enforceOpenProjectIntentImmutability(request);
    const acknowledgement =
      await this.postInteractionDeferredAcknowledgement(input);
    if (!acknowledgement.ok) {
      await this.recordInteractionResponseFailure(
        request,
        immutability.ok
          ? 'discord-interaction-deferred'
          : 'discord-fail-closed',
        acknowledgement.responsePostError,
        acknowledgement.responseReceipt,
      );
      const acknowledgementFailureResult = {
        request,
        policyDecisionId: 'discord-fail-closed',
        allowed: false,
        persistedKey: request.id,
        failedClosed: true,
        responsePayload: renderDiscordControlBlockedMessage(request),
        responsePostError: acknowledgement.responsePostError,
        ...(acknowledgement.responseReceipt === undefined
          ? {}
          : { responseReceipt: acknowledgement.responseReceipt }),
      };

      return createDiscordControlResultWithOptionalWorkItem(
        acknowledgementFailureResult,
        request,
      );
    }
    if (!immutability.ok) {
      return this.handleDeferredIntentImmutabilityFailure(
        request,
        immutability.reason,
        acknowledgement.responseReceipt,
      );
    }
    const result = await this.handleNormalizedAction(request);
    const renderedRequest = await this.hydrateRequestSummaryMetadata(
      result.request,
    );
    let responsePayload: DiscordMessagePayload;
    if (result.allowed) {
      responsePayload = renderAcceptedControlMessage(renderedRequest);
    } else if (result.failedClosed) {
      responsePayload = renderDiscordControlBlockedMessage(
        renderedRequest,
        result.blockedReason,
      );
    } else {
      responsePayload = renderDiscordControlBlockedMessage(renderedRequest);
    }
    const threadPayload = responsePayload;
    const threadPostResult = await this.postThreadMessageAfterAcknowledgement(
      result.request.threadId,
      threadPayload,
    );
    let completionProjection: Partial<
      Pick<DiscordControlResult, 'completionPostError' | 'completionReceipt'>
    > = {};
    if (!isDiscordComponentInteraction(input)) {
      const completionPayload = threadPostResult.ok
        ? renderDiscordInteractionCompletionMessage(renderedRequest)
        : renderDiscordInteractionThreadPostFailureCompletionMessage(
            renderedRequest,
            threadPostResult.threadPostError,
          );
      const completionResult = await this.postInteractionCompletion(
        input,
        completionPayload,
      );
      completionProjection =
        createDiscordCompletionResultProjection(completionResult);
    }

    return {
      ...result,
      responseReceipt: acknowledgement.responseReceipt,
      responsePayload,
      threadPayload,
      ...(threadPostResult.ok
        ? { threadReceipt: threadPostResult.threadReceipt }
        : {
            threadPostError: threadPostResult.threadPostError,
            ...(threadPostResult.threadReceipt === undefined
              ? {}
              : { threadReceipt: threadPostResult.threadReceipt }),
          }),
      ...completionProjection,
    };
  }

  /**
   * Handles immutable-intent fail-closed outcomes after interaction acknowledgement.
   */
  private async handleDeferredIntentImmutabilityFailure(
    request: DiscordControlRequest,
    reason: string,
    responseReceipt: DiscordResponseReceipt,
  ): Promise<DiscordControlResult> {
    const responsePayload = renderDiscordControlBlockedMessage(request, reason);
    await this.telemetry.recordAudit({
      auditId: `${request.id}:audit`,
      runId: request.id,
      eventId: request.id,
      actorId: request.actorId,
      action: request.action,
      scope: 'discord',
      outcome: 'blocked',
      reason,
      artifactIds:
        request.workItem?.artifactId === undefined
          ? []
          : [request.workItem.artifactId],
      recordedAt: request.updatedAt,
      policyDecisionId: 'discord-fail-closed',
      details: {
        threadId: request.threadId,
        channelId: request.channelId,
        resultStatus: 'intent-mismatch',
        correlationId: request.id,
      },
    });
    const threadPostResult = await this.postThreadMessageAfterAcknowledgement(
      request.threadId,
      responsePayload,
    );
    return createDiscordControlResultWithOptionalWorkItem(
      {
        request,
        policyDecisionId: 'discord-fail-closed',
        allowed: false,
        persistedKey: request.id,
        failedClosed: true,
        responsePayload,
        blockedReason: reason,
        responseReceipt,
        ...(threadPostResult.ok
          ? { threadReceipt: threadPostResult.threadReceipt }
          : {
              ...(threadPostResult.threadReceipt === undefined
                ? {}
                : { threadReceipt: threadPostResult.threadReceipt }),
              threadPostError: threadPostResult.threadPostError,
            }),
      },
      request,
    );
  }

  /**
   * Handles a route failure after an HTTP webhook response has already ACKed Discord.
   */
  private async handleAcknowledgedInteractionRouteFailure(
    input: DiscordOperatorInteraction,
    reason: string,
  ): Promise<DiscordControlResult> {
    const responsePayload = renderDiscordRouteFailureMessage(input, reason);
    const request = createDiscordControlRequest({
      id: input.id,
      summary: reason,
      status: 'blocked',
      trace: [],
      updatedAt: input.updatedAt,
      actorId: input.actorId,
      threadId: 'unresolved',
      channelId: input.channelId,
      action: DEVPLAT_ACTION_SHOW_STATUS,
      privileged: false,
    });

    await this.telemetry.recordAudit({
      auditId: `${input.id}:audit`,
      runId: input.id,
      eventId: input.id,
      actorId: input.actorId,
      action: DEVPLAT_ACTION_SHOW_STATUS,
      scope: 'discord',
      outcome: 'blocked',
      reason,
      artifactIds: [],
      recordedAt: input.updatedAt,
      policyDecisionId: 'discord-fail-closed',
      details: {
        threadId: 'unresolved',
        channelId: input.channelId,
        resultStatus: 'refused',
        correlationId: input.id,
      },
    });

    return {
      request,
      policyDecisionId: 'discord-fail-closed',
      allowed: false,
      persistedKey: input.id,
      responsePayload,
      failedClosed: true,
    };
  }

  /**
   * Handles a routed interaction after the receiving surface has already ACKed Discord.
   */
  private async handleAcknowledgedRoutedInteraction(
    input: DiscordOperatorInteraction,
    request: DiscordControlRequest,
  ): Promise<DiscordControlResult> {
    const result = await this.handleNormalizedAction(request);
    const renderedRequest = await this.hydrateRequestSummaryMetadata(
      result.request,
    );
    let responsePayload: DiscordMessagePayload;
    if (result.allowed) {
      responsePayload = renderAcceptedControlMessage(renderedRequest);
    } else if (result.failedClosed) {
      responsePayload = renderDiscordControlBlockedMessage(
        renderedRequest,
        result.blockedReason,
      );
    } else {
      responsePayload = renderDiscordControlBlockedMessage(renderedRequest);
    }
    const threadPostResult = await this.postThreadMessageAfterAcknowledgement(
      result.request.threadId,
      responsePayload,
    );
    let completionProjection: Partial<
      Pick<DiscordControlResult, 'completionPostError' | 'completionReceipt'>
    > = {};
    if (!isDiscordComponentInteraction(input)) {
      const completionPayload = threadPostResult.ok
        ? renderDiscordInteractionCompletionMessage(result.request)
        : renderDiscordInteractionThreadPostFailureCompletionMessage(
            result.request,
            threadPostResult.threadPostError,
          );
      const completionResult = await this.postInteractionCompletion(
        input,
        completionPayload,
      );
      completionProjection =
        createDiscordCompletionResultProjection(completionResult);
    }

    return {
      ...result,
      responsePayload,
      threadPayload: responsePayload,
      ...(threadPostResult.ok
        ? { threadReceipt: threadPostResult.threadReceipt }
        : {
            threadPostError: threadPostResult.threadPostError,
            ...(threadPostResult.threadReceipt === undefined
              ? {}
              : { threadReceipt: threadPostResult.threadReceipt }),
          }),
      ...completionProjection,
    };
  }

  /**
   * Handles durable control-plane work after an HTTP interaction webhook ACK.
   */
  public async handleAcknowledgedInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    const route = createDiscordControlRequestFromInteraction(input);

    return route.ok
      ? this.handleAcknowledgedRoutedInteraction(input, route.request)
      : this.handleAcknowledgedInteractionRouteFailure(input, route.reason);
  }

  /** Handle interaction. */
  public async handleInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    const route = createDiscordControlRequestFromInteraction(input);

    return route.ok
      ? this.handleRoutedInteraction(input, route.request)
      : this.handleInteractionRouteFailure(input, route.reason);
  }
}
