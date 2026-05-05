import { TelemetryEventService } from '@vannadii/devplat-observability';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordChannelBinding,
  createDiscordThreadBindingResult,
  describeDiscordChannelBinding,
} from './logic.js';
import type {
  DiscordChannelBinding,
  DiscordThreadBindingResult,
} from './codec.js';

/** Discord channel binding service service. */
export class DiscordChannelBindingService {
  public constructor(
    private readonly telemetry = new TelemetryEventService(),
    private readonly store = new FileStoreService(),
  ) {}

  /** Executes the service operation. */
  public execute(input: DiscordChannelBinding): DiscordChannelBinding {
    return createDiscordChannelBinding(input);
  }

  /** Describes the service result for operators. */
  public explain(input: DiscordChannelBinding): string {
    return describeDiscordChannelBinding(input);
  }

  /** Bind thread. */
  public async bindThread(
    input: DiscordChannelBinding,
    threadId: string,
    parentChannelId: string,
    actorId = 'discord-system',
  ): Promise<DiscordThreadBindingResult> {
    const binding = this.execute(input);
    const result = createDiscordThreadBindingResult(
      binding,
      threadId,
      parentChannelId,
    );
    const persistedKey = `${binding.id}:${threadId}`;

    await this.store.store({
      id: persistedKey,
      key: persistedKey,
      scope: 'state',
      summary: `Discord ${binding.kind} thread binding`,
      status: 'approved',
      trace: binding.trace,
      updatedAt: binding.updatedAt,
      payload: {
        guildId: binding.guildId,
        channelId: binding.channelId,
        kind: binding.kind,
        threadId: result.threadId,
        parentChannelId: result.parentChannelId,
        routingKey: result.routingKey,
      },
    });

    await this.telemetry.record({
      id: `telemetry-${persistedKey}`,
      summary: `Bound Discord ${binding.kind} thread ${result.threadId}`,
      status: 'approved',
      trace: binding.trace,
      updatedAt: binding.updatedAt,
      actorId,
      action: 'bind-thread',
      scope: 'discord',
      details: {
        guildId: binding.guildId,
        channelId: binding.channelId,
        kind: binding.kind,
        threadId: result.threadId,
        parentChannelId: result.parentChannelId,
        routingKey: result.routingKey,
      },
    });

    return {
      ...result,
      persistedKey,
    };
  }
}
