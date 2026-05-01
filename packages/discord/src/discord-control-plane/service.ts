import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordControlRequest,
  createDiscordControlRequestFromInteraction,
  describeDiscordWorkItemBinding,
  describeDiscordControlRequest,
} from './logic.js';
import type {
  DiscordControlRequest,
  DiscordControlResult,
  DiscordOperatorInteraction,
  DiscordResponseReceipt,
} from './types.js';

function createDiscordActionMessage(
  prefix: string,
  request: DiscordControlRequest,
): string {
  return request.workItem === undefined
    ? `${prefix} ${request.action}.`
    : `${prefix} ${request.action} for ${describeDiscordWorkItemBinding(request.workItem)}.`;
}

export interface DiscordControlResponseTransport {
  postInteractionResponse(
    input: DiscordOperatorInteraction,
    content: string,
  ): Promise<DiscordResponseReceipt>;
  postThreadMessage(
    threadId: string,
    content: string,
  ): Promise<DiscordResponseReceipt>;
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
    content: string,
  ): Promise<DiscordResponseReceipt> {
    const endpoint = `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`;
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 4,
        data: {
          content,
        },
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
    content: string,
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
      body: JSON.stringify({ content }),
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
    content: string,
  ): Promise<DiscordResponseReceipt> {
    return Promise.resolve({
      endpoint: `/interactions/${encodeURIComponent(input.id)}/${encodeURIComponent(input.token)}/callback`,
      statusCode: 200,
      responseBody: {
        mode: 'loopback',
        content,
        interactionId: input.id,
      },
    });
  }

  public postThreadMessage(
    threadId: string,
    content: string,
  ): Promise<DiscordResponseReceipt> {
    return Promise.resolve({
      endpoint: `/channels/${encodeURIComponent(threadId)}/messages`,
      statusCode: 200,
      responseBody: {
        mode: 'loopback',
        content,
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

  public async handleInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    const route = createDiscordControlRequestFromInteraction(input);

    if (!route.ok) {
      const responseReceipt = await this.responses.postInteractionResponse(
        input,
        route.reason,
      );

      return {
        request: createDiscordControlRequest({
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
        }),
        policyDecisionId: 'discord-fail-closed',
        allowed: false,
        persistedKey: input.id,
        responseReceipt,
        failedClosed: true,
      };
    }

    const result = await this.handleAction(route.request);
    const responseReceipt = await this.responses.postInteractionResponse(
      input,
      result.allowed
        ? createDiscordActionMessage('Accepted', route.request)
        : createDiscordActionMessage('Blocked', route.request),
    );
    const threadReceipt = await this.responses.postThreadMessage(
      route.request.threadId,
      result.allowed
        ? createDiscordActionMessage('DevPlat accepted', route.request)
        : createDiscordActionMessage('DevPlat blocked', route.request),
    );

    return {
      ...result,
      responseReceipt,
      threadReceipt,
    };
  }
}
