import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
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
    };

export interface DiscordControlResponseTransport {
  postInteractionResponse(
    input: DiscordOperatorInteraction,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt>;
  postInteractionDeferred(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordResponseReceipt>;
  postThreadMessage(
    threadId: string,
    payload: DiscordMessagePayload,
  ): Promise<DiscordResponseReceipt>;
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

export class DiscordRestResponseTransport implements DiscordControlResponseTransport {
  public constructor(
    private readonly botToken = process.env['DISCORD_BOT_TOKEN'] ?? '',
    private readonly baseUrl = process.env['DISCORD_API_BASE_URL'] ??
      'https://discord.com/api/v10',
    private readonly fetchImpl = fetch,
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
      return {
        ok: true,
        threadReceipt: await this.responses.postThreadMessage(
          threadId,
          payload,
        ),
      };
    } catch (error) {
      return {
        ok: false,
        threadPostError: describeDiscordTransportError(error),
      };
    }
  }

  /**
   * Records an audit event when Discord rejects the initial acknowledgement.
   */
  private async recordInteractionResponseRejection(
    request: DiscordControlRequest,
    decision: DiscordControlActionDecision,
    responseReceipt: DiscordResponseReceipt,
  ): Promise<void> {
    await this.telemetry.recordAudit({
      auditId: `${request.id}:audit`,
      runId: request.id,
      eventId: request.id,
      actorId: request.actorId,
      action: request.action,
      scope: 'discord',
      outcome: 'blocked',
      reason: describeDiscordInteractionResponseRejection(responseReceipt),
      artifactIds:
        request.workItem?.artifactId === undefined
          ? []
          : [request.workItem.artifactId],
      recordedAt: request.updatedAt,
      policyDecisionId: decision.id,
      details:
        request.workItem === undefined
          ? {
              threadId: request.threadId,
              channelId: request.channelId,
              resultStatus: 'response-rejected',
              correlationId: request.id,
              responseStatusCode: responseReceipt.statusCode,
            }
          : {
              threadId: request.threadId,
              channelId: request.channelId,
              resultStatus: 'response-rejected',
              correlationId: request.id,
              responseStatusCode: responseReceipt.statusCode,
              workItem: request.workItem,
            },
    });
  }

  public async handleInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    const route = createDiscordControlRequestFromInteraction(input);

    if (!route.ok) {
      const responsePayload = renderDiscordRouteFailureMessage(input);
      const responseReceipt = await this.responses.postInteractionResponse(
        input,
        responsePayload,
      );
      const request = createDiscordControlRequest({
        id: input.id,
        summary: route.reason,
        status: 'blocked',
        trace: [],
        updatedAt: input.updatedAt,
        actorId: input.actorId,
        threadId: 'unresolved',
        channelId: input.channelId,
        action: 'show-status',
        privileged: false,
      });
      await this.telemetry.recordAudit({
        auditId: `${input.id}:audit`,
        runId: input.id,
        eventId: input.id,
        actorId: input.actorId,
        action: 'show-status',
        scope: 'discord',
        outcome: 'blocked',
        reason:
          'Discord interaction refused because thread binding was ambiguous.',
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
        responseReceipt,
        responsePayload,
        failedClosed: true,
      };
    }

    const request = route.request;
    const decision = this.policy.evaluateControlAction(
      request.action,
      request.privileged,
    );
    const responsePayload = decision.allowed
      ? renderDiscordControlAcceptedMessage(route.request)
      : renderDiscordControlBlockedMessage(route.request);
    const threadPayload = responsePayload;
    const responseReceipt = await this.responses.postInteractionResponse(
      input,
      responsePayload,
    );
    if (!isDiscordRestSuccessStatus(responseReceipt.statusCode)) {
      await this.recordInteractionResponseRejection(
        request,
        decision,
        responseReceipt,
      );
      const result = {
        request,
        policyDecisionId: decision.id,
        allowed: false,
        persistedKey: request.id,
        failedClosed: true,
        responseReceipt,
        responsePayload,
        responsePostError:
          describeDiscordInteractionResponseRejection(responseReceipt),
      };

      return request.workItem === undefined
        ? result
        : {
            ...result,
            workItem: request.workItem,
          };
    }
    const result = await this.persistAction(request, decision);
    const threadPostResult = await this.postThreadMessageAfterAcknowledgement(
      route.request.threadId,
      threadPayload,
    );

    return {
      ...result,
      responseReceipt,
      responsePayload,
      threadPayload,
      ...(threadPostResult.ok
        ? { threadReceipt: threadPostResult.threadReceipt }
        : { threadPostError: threadPostResult.threadPostError }),
    };
  }
}
