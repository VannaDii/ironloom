import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordOperatorInteractionFromCallback,
  createDiscordControlRequestFromInteraction,
} from '../discord-control-plane/logic.js';
import {
  DiscordControlPlaneService,
  DiscordLoopbackResponseTransport,
} from '../discord-control-plane/service.js';
import {
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
  DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
} from '../discord-control-plane/constants.js';
import { renderDiscordRouteFailureMessage } from '../discord-control-plane/renderer.js';
import type {
  DiscordControlResult,
  DiscordInteractionCallbackOptions,
  DiscordMessagePayload,
  DiscordOperatorInteraction,
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

/** Background runner for durable work after Discord has received an HTTP ACK. */
export type DiscordInteractionWebhookBackgroundRunner = (
  task: () => Promise<DiscordControlResult>,
) => void;

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
 * Runs post-ACK webhook work without holding Discord's interaction request open.
 */
function runDetachedWebhookTask(
  task: () => Promise<DiscordControlResult>,
): void {
  void task().catch(() => undefined);
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
 * Returns true when the callback came from a message component.
 */
function isWebhookComponentInteraction(
  input: DiscordOperatorInteraction,
): boolean {
  return input.customId !== undefined;
}

/**
 * Builds the immediate HTTP ACK Discord expects for routed webhook interactions.
 */
function createDeferredWebhookResponsePayload(
  input: DiscordOperatorInteraction,
): DiscordInteractionWebhookResponseBody {
  return isWebhookComponentInteraction(input)
    ? {
        type: DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
      }
    : {
        type: DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
        data: {
          flags: DISCORD_EPHEMERAL_MESSAGE_FLAG,
        },
      };
}

/** Discord interaction webhook service. */
export class DiscordInteractionWebhookService {
  public constructor(
    private readonly controlPlane = createDefaultControlPlane(),
    private readonly resolveBinding: DiscordInteractionWebhookBindingResolver = () =>
      Promise.resolve({}),
    private readonly runInBackground: DiscordInteractionWebhookBackgroundRunner = runDetachedWebhookTask,
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
    const route = createDiscordControlRequestFromInteraction(interaction);
    const responseBody = route.ok
      ? createDeferredWebhookResponsePayload(interaction)
      : createMessageResponsePayload(
          renderDiscordRouteFailureMessage(interaction),
        );

    this.runInBackground(() =>
      this.controlPlane.handleAcknowledgedInteraction(interaction),
    );

    return {
      statusCode: 200,
      verified: true,
      handled: true,
      responseBody,
      persistedKey: interaction.id,
      ...(route.ok
        ? { threadId: route.request.threadId }
        : { threadId: 'unresolved' }),
    };
  }
}
