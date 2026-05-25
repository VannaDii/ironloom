import {
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_PROJECT_SUMMARY,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
} from '@vannadii/devplat-core';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
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
 * Builds the state key that reserves a unique project identity within a repo.
 */
function createProjectIdentityStateKey(repo: string, project: string): string {
  return `project-identity:${repo.trim().toLowerCase()}:${project
    .trim()
    .toLowerCase()}`;
}

/** Detects duplicate-write errors returned by the file-store layer. */
function isAlreadyExistsStoreError(error: string): boolean {
  const normalized = error.toLowerCase();
  return normalized.includes('eexist') || normalized.includes('already exists');
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
   * Reads persisted project metadata used by status and summary responses.
   */
  private async resolveThreadProjectMetadata(
    threadId: string,
  ): Promise<{ intent?: string; configVersion?: string }> {
    const [intentState, configVersionState] = await Promise.all([
      this.store.read('state', createOpenProjectIntentStateKey(threadId)),
      this.store.read('state', createProjectConfigVersionStateKey(threadId)),
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

    return {
      ...(intent === undefined || intent.length === 0 ? {} : { intent }),
      ...(configVersion === undefined || configVersion.length === 0
        ? {}
        : { configVersion }),
    };
  }

  /**
   * Injects persisted intent/config markers into status and project-summary requests.
   */
  private async hydrateRequestSummaryMetadata(
    request: DiscordControlRequest,
  ): Promise<DiscordControlRequest> {
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

    return {
      ...request,
      summary: `${request.summary}${intentMarker}${configMarker}`.trim(),
    };
  }

  /**
   * Advances and persists config version on successful project-settings mutations.
   */
  private async persistProjectConfigVersion(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
  ): Promise<void> {
    if (
      request.action !== DEVPLAT_ACTION_PROJECT_SETTINGS ||
      !decision.allowed
    ) {
      return;
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
      return { ok: true };
    }

    const stateKey = createProjectIdentityStateKey(repo, project);
    const previous = await this.store.read('state', stateKey);
    if (!previous.ok) {
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
    if (boundThreadId === undefined) {
      return {
        ok: true,
        persistRepo: repo,
        persistProject: project,
        stateKey,
      };
    }

    return {
      ok: false,
      reason: `new-project identity already exists: repo=${repo} project=${project} boundThread=${boundThreadId}.`,
    };
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
      },
      request,
    );
  }

  /**
   * Persists `/new-project` identity reservation with create-only semantics.
   */
  private async reserveNewProjectIdentity(
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
    const reservation = await this.store.storeIfAbsent({
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
    if (reservation.ok) {
      return undefined;
    }
    const fallbackReason = isAlreadyExistsStoreError(reservation.error)
      ? `new-project identity already exists: repo=${identityUniqueness.persistRepo} project=${identityUniqueness.persistProject}.`
      : `new-project identity reservation failed: ${reservation.error}`;
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
    const identityUniqueness =
      await this.enforceNewProjectIdentityUniqueness(request);
    if (!identityUniqueness.ok) {
      return this.failClosedWithAudit(
        request,
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
          threadId: request.threadId,
          action: request.action,
          intent: immutability.persistIntent,
        },
      });
    }
    if (decision.allowed) {
      const reservationFailure = await this.reserveNewProjectIdentity(
        request,
        identityUniqueness,
      );
      if (reservationFailure !== undefined) {
        return reservationFailure;
      }
    }

    return this.persistAction(request, decision);
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
    await this.persistProjectConfigVersion(request, decision);

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
   * Handles routed interaction failure when open-project intent is not immutable.
   */
  private async handleRoutedIntentImmutabilityFailure(
    input: DiscordOperatorInteraction,
    request: DiscordControlRequest,
    reason: string,
  ): Promise<DiscordControlResult> {
    const responsePayload = renderDiscordControlBlockedMessage(request, reason);
    const acknowledgement =
      await this.postInteractionDeferredAcknowledgement(input);
    if (!acknowledgement.ok) {
      await this.recordInteractionResponseFailure(
        request,
        'discord-fail-closed',
        acknowledgement.responsePostError,
        acknowledgement.responseReceipt,
      );
      return createDiscordControlResultWithOptionalWorkItem(
        {
          request,
          policyDecisionId: 'discord-fail-closed',
          allowed: false,
          persistedKey: request.id,
          failedClosed: true,
          responsePayload,
          responsePostError: acknowledgement.responsePostError,
          ...(acknowledgement.responseReceipt === undefined
            ? {}
            : { responseReceipt: acknowledgement.responseReceipt }),
        },
        request,
      );
    }

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
        responseReceipt: acknowledgement.responseReceipt,
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
   * Handles a routed interaction after thread context has resolved.
   */
  private async handleRoutedInteraction(
    input: DiscordOperatorInteraction,
    request: DiscordControlRequest,
  ): Promise<DiscordControlResult> {
    const renderedRequest = await this.hydrateRequestSummaryMetadata(request);
    const immutability =
      await this.enforceOpenProjectIntentImmutability(renderedRequest);
    if (!immutability.ok) {
      return this.handleRoutedIntentImmutabilityFailure(
        input,
        renderedRequest,
        immutability.reason,
      );
    }

    const decision = this.policy.evaluateControlAction(
      renderedRequest.action,
      renderedRequest.privileged,
    );
    const responsePayload = decision.allowed
      ? renderAcceptedControlMessage(renderedRequest)
      : renderDiscordControlBlockedMessage(renderedRequest);
    const threadPayload = responsePayload;
    const acknowledgement =
      await this.postInteractionDeferredAcknowledgement(input);
    if (!acknowledgement.ok) {
      await this.recordInteractionResponseFailure(
        renderedRequest,
        decision.id,
        acknowledgement.responsePostError,
        acknowledgement.responseReceipt,
      );
      const result = {
        request: renderedRequest,
        policyDecisionId: decision.id,
        allowed: false,
        persistedKey: renderedRequest.id,
        failedClosed: true,
        responsePayload,
        responsePostError: acknowledgement.responsePostError,
        ...(acknowledgement.responseReceipt === undefined
          ? {}
          : { responseReceipt: acknowledgement.responseReceipt }),
      };

      return createDiscordControlResultWithOptionalWorkItem(
        result,
        renderedRequest,
      );
    }
    const result = await this.persistAction(renderedRequest, decision);
    const threadPostResult = await this.postThreadMessageAfterAcknowledgement(
      renderedRequest.threadId,
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
    const renderedRequest = await this.hydrateRequestSummaryMetadata(request);
    const decision = this.policy.evaluateControlAction(
      renderedRequest.action,
      renderedRequest.privileged,
    );
    const responsePayload = decision.allowed
      ? renderAcceptedControlMessage(renderedRequest)
      : renderDiscordControlBlockedMessage(renderedRequest);
    const result = await this.persistAction(renderedRequest, decision);
    const threadPostResult = await this.postThreadMessageAfterAcknowledgement(
      renderedRequest.threadId,
      responsePayload,
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
