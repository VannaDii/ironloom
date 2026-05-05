import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordOperatorInteractionFromCallback,
  describeDiscordControlRequest,
} from '../discord-control-plane/logic.js';
import {
  DiscordControlPlaneService,
  DiscordLoopbackResponseTransport,
} from '../discord-control-plane/service.js';
import type {
  DiscordControlResult,
  DiscordInteractionCallbackOptions,
  DiscordMessagePayload,
} from '../discord-control-plane/codec.js';
import {
  parseDiscordInteractionWebhookBody,
  verifyDiscordInteractionSignature,
} from './logic.js';
import type {
  DiscordInteractionWebhookRequest,
  DiscordInteractionWebhookResponseBody,
  DiscordInteractionWebhookResult,
} from './codec.js';

/** Contract for discord interaction webhook binding resolver. */
export type DiscordInteractionWebhookBindingResolver = (
  input: Parameters<typeof createDiscordOperatorInteractionFromCallback>[0],
) => Promise<DiscordInteractionCallbackOptions>;

/** Creates default control plane. */
function createDefaultControlPlane(): DiscordControlPlaneService {
  return new DiscordControlPlaneService(
    new DecisionPolicyService(),
    new TelemetryEventService(),
    new FileStoreService(),
    new DiscordLoopbackResponseTransport(),
  );
}

/**
 * Wraps plain webhook error text in the structured Discord payload shape.
 */
function createWebhookMessagePayload(content: string): DiscordMessagePayload {
  return {
    content,
  };
}

/**
 * Builds a Discord interaction channel-message response from a payload.
 */
function createMessageResponsePayload(
  data: DiscordMessagePayload,
): DiscordInteractionWebhookResponseBody {
  return {
    type: 4,
    data,
  };
}

/**
 * Resolves the structured payload that should be returned to Discord.
 */
function resolveControlResultResponsePayload(
  result: DiscordControlResult,
): DiscordMessagePayload {
  if (result.responsePayload !== undefined) {
    return result.responsePayload;
  }

  return createWebhookMessagePayload(
    result.failedClosed
      ? result.request.summary
      : describeDiscordControlRequest(result.request),
  );
}

/** Discord interaction webhook service service. */
export class DiscordInteractionWebhookService {
  public constructor(
    private readonly controlPlane = createDefaultControlPlane(),
    private readonly resolveBinding: DiscordInteractionWebhookBindingResolver = () =>
      Promise.resolve({}),
  ) {}

  /** Handle. */
  public async handle(
    input: DiscordInteractionWebhookRequest,
  ): Promise<DiscordInteractionWebhookResult> {
    if (!verifyDiscordInteractionSignature(input)) {
      return {
        statusCode: 401,
        verified: false,
        handled: false,
        responseBody: createMessageResponsePayload(
          createWebhookMessagePayload(
            'Discord interaction signature verification failed.',
          ),
        ),
        error: 'Discord interaction signature verification failed.',
      };
    }

    const parsed = parseDiscordInteractionWebhookBody(input.body);
    if (!parsed.ok) {
      return {
        statusCode: 400,
        verified: true,
        handled: false,
        responseBody: createMessageResponsePayload(
          createWebhookMessagePayload(parsed.reason),
        ),
        error: parsed.reason,
      };
    }

    if (parsed.kind === 'ping') {
      return {
        statusCode: 200,
        verified: true,
        handled: false,
        responseBody: {
          type: 1,
        },
      };
    }

    const interaction = createDiscordOperatorInteractionFromCallback(
      parsed.callback,
      await this.resolveBinding(parsed.callback),
    );
    const result = await this.controlPlane.handleInteraction(interaction);

    return {
      statusCode: 200,
      verified: true,
      handled: true,
      responseBody: createMessageResponsePayload(
        resolveControlResultResponsePayload(result),
      ),
      persistedKey: result.persistedKey,
      policyDecisionId: result.policyDecisionId,
      threadId: result.request.threadId,
    };
  }
}
