import { DEVPLAT_ACTION_SHOW_STATUS } from '@vannadii/devplat-core';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  DISCORD_APPLICATION_ID_ENVIRONMENT_VARIABLE,
  DISCORD_REST_SUCCESS_MAX_EXCLUSIVE_STATUS,
  DISCORD_REST_SUCCESS_MIN_STATUS,
  DISCORD_INTERACTION_CHANNEL_MESSAGE_RESPONSE_TYPE,
  DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
} from './constants.js';
import {
  createDiscordControlRequest,
  createDiscordControlRequestFromInteraction,
  describeDiscordControlRequest,
} from './logic.js';
import {
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

  public async postInteractionDeferred(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordResponseReceipt> {
    const endpoint = `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`;
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
      }),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    return {
      endpoint,
      statusCode: response.status,
      responseBody,
    };
  }

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

export class DiscordLoopbackResponseTransport implements DiscordControlResponseTransport {
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

export class DiscordControlPlaneService {
  public constructor(
    private readonly policy = new DecisionPolicyService(),
    private readonly telemetry = new TelemetryEventService(),
    private readonly store = new FileStoreService(),
    private readonly responses: DiscordControlResponseTransport = new DiscordRestResponseTransport(),
  ) {}

  public execute(input: DiscordControlRequest): DiscordControlRequest {
    return createDiscordControlRequest(input);
  }

  public explain(input: DiscordControlRequest): string {
    return describeDiscordControlRequest(input);
  }

  public async handleAction(
    input: DiscordControlRequest,
  ): Promise<DiscordControlResult> {
    const request = this.execute(input);
    const decision = this.policy.evaluateControlAction(
      request.action,
      request.privileged,
    );

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
    const responsePayload = renderDiscordRouteFailureMessage(input);
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
      ? 'Discord interaction refused because thread binding was ambiguous.'
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
    const decision = this.policy.evaluateControlAction(
      request.action,
      request.privileged,
    );
    const responsePayload = decision.allowed
      ? renderDiscordControlAcceptedMessage(request)
      : renderDiscordControlBlockedMessage(request);
    const threadPayload = responsePayload;
    const acknowledgement =
      await this.postInteractionDeferredAcknowledgement(input);
    if (!acknowledgement.ok) {
      await this.recordInteractionResponseFailure(
        request,
        decision.id,
        acknowledgement.responsePostError,
        acknowledgement.responseReceipt,
      );
      const result = {
        request,
        policyDecisionId: decision.id,
        allowed: false,
        persistedKey: request.id,
        failedClosed: true,
        responsePayload,
        responsePostError: acknowledgement.responsePostError,
        ...(acknowledgement.responseReceipt === undefined
          ? {}
          : { responseReceipt: acknowledgement.responseReceipt }),
      };

      return createDiscordControlResultWithOptionalWorkItem(result, request);
    }
    const result = await this.persistAction(request, decision);
    const threadPostResult = await this.postThreadMessageAfterAcknowledgement(
      request.threadId,
      threadPayload,
    );
    const completionPayload = threadPostResult.ok
      ? renderDiscordInteractionCompletionMessage(request)
      : renderDiscordInteractionThreadPostFailureCompletionMessage(
          request,
          threadPostResult.threadPostError,
        );
    const completionResult = await this.postInteractionCompletion(
      input,
      completionPayload,
    );
    const completionProjection =
      createDiscordCompletionResultProjection(completionResult);

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

  public async handleInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    const route = createDiscordControlRequestFromInteraction(input);

    return route.ok
      ? this.handleRoutedInteraction(input, route.request)
      : this.handleInteractionRouteFailure(input, route.reason);
  }
}
