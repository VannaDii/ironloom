import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import { createDiscordOperatorInteractionFromCallback } from '../discord-control-plane/logic.js';
import {
  DiscordControlPlaneService,
  DiscordLoopbackResponseTransport,
} from '../discord-control-plane/service.js';
import type { DiscordInteractionCallbackOptions } from '../discord-control-plane/codec.js';
import {
  decodeDiscordGatewayInteractionCallback,
  isDiscordGatewayInteractionCreateEvent,
} from './logic.js';
import type {
  DiscordGatewayDispatchEvent,
  DiscordInteractionGatewayResult,
} from './codec.js';

export type DiscordInteractionGatewayBindingResolver = (
  input: Parameters<typeof createDiscordOperatorInteractionFromCallback>[0],
) => Promise<DiscordInteractionCallbackOptions>;

/**
 * Creates the local default control plane used by isolated Gateway tests.
 */
function createDefaultControlPlane(): DiscordControlPlaneService {
  return new DiscordControlPlaneService(
    new DecisionPolicyService(),
    new TelemetryEventService(),
    new FileStoreService(),
    new DiscordLoopbackResponseTransport(),
  );
}

export class DiscordInteractionGatewayService {
  public constructor(
    private readonly controlPlane = createDefaultControlPlane(),
    private readonly resolveBinding: DiscordInteractionGatewayBindingResolver = () =>
      Promise.resolve({}),
  ) {}

  /**
   * Handles an outbound Discord Gateway dispatch without requiring public ingress.
   */
  public async handleDispatch(
    input: DiscordGatewayDispatchEvent,
  ): Promise<DiscordInteractionGatewayResult> {
    if (!isDiscordGatewayInteractionCreateEvent(input)) {
      return {
        status: 'ignored',
        eventName: input.t,
      };
    }

    const decoded = decodeDiscordGatewayInteractionCallback(input);
    if (!decoded.ok) {
      return {
        status: 'rejected',
        eventName: input.t,
        reason: decoded.reason,
      };
    }

    const interaction = createDiscordOperatorInteractionFromCallback(
      decoded.callback,
      await this.resolveBinding(decoded.callback),
    );
    const controlResult =
      await this.controlPlane.handleInteraction(interaction);

    return {
      status: 'handled',
      interactionId: interaction.id,
      threadId: controlResult.request.threadId,
      controlResult,
    };
  }
}
