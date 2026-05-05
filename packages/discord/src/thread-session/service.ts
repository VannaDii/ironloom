import {
  ARTIFACT_TYPE_DISCORD_THREAD_SESSION,
  STORE_SCOPE_ARTIFACTS,
  STORE_SCOPE_STATE,
} from '@vannadii/devplat-core';
import { ArtifactEnvelopeService } from '@vannadii/devplat-artifacts';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordThreadSession,
  describeDiscordThreadSession,
} from './logic.js';
import type {
  DiscordThreadSession,
  DiscordThreadSessionInput,
  DiscordThreadSessionResult,
} from './codec.js';
import {
  DISCORD_THREAD_SESSION_OPEN_ACTION,
  DISCORD_THREAD_SESSION_SYSTEM_ACTOR_ID,
  DISCORD_THREAD_SESSION_TELEMETRY_SCOPE,
} from './constants.js';

/**
 * Artifact payload that preserves Discord-owned thread-session metadata.
 */
type DiscordThreadSessionArtifactPayload = {
  guildId: string;
  channelId: string;
  parentChannelId: string;
  threadId: string;
  kind: DiscordThreadSession['kind'];
  specId: DiscordThreadSession['specId'];
  sliceId: DiscordThreadSession['sliceId'];
  pullRequestNumber: DiscordThreadSession['pullRequestNumber'];
};

/**
 * Builds the artifact payload for a Discord thread session without assigning it
 * to another package's lifecycle schema.
 */
function createThreadSessionArtifactPayload(
  session: DiscordThreadSession,
): DiscordThreadSessionArtifactPayload {
  return {
    guildId: session.guildId,
    channelId: session.channelId,
    parentChannelId: session.parentChannelId,
    threadId: session.threadId,
    kind: session.kind,
    specId: session.specId,
    sliceId: session.sliceId,
    pullRequestNumber: session.pullRequestNumber,
  };
}

/** Discord thread session service. */
export class DiscordThreadSessionService {
  public constructor(
    private readonly artifacts = new ArtifactEnvelopeService(),
    private readonly telemetry = new TelemetryEventService(),
    private readonly store = new FileStoreService(),
  ) {}

  /** Executes the service operation. */
  public execute(input: DiscordThreadSessionInput): DiscordThreadSession {
    return createDiscordThreadSession(input);
  }

  /** Describes the service result for operators. */
  public explain(input: DiscordThreadSession): string {
    return describeDiscordThreadSession(input);
  }

  /** Open thread. */
  public async openThread(
    input: DiscordThreadSessionInput,
    actorId = DISCORD_THREAD_SESSION_SYSTEM_ACTOR_ID,
  ): Promise<DiscordThreadSessionResult> {
    const session = this.execute(input);

    const artifact = this.artifacts.execute({
      id: session.artifactId,
      artifactType: ARTIFACT_TYPE_DISCORD_THREAD_SESSION,
      version: 1,
      summary: `Discord ${session.kind} thread ${session.threadId}`,
      status: session.status,
      trace: session.trace,
      updatedAt: session.updatedAt,
      payload: createThreadSessionArtifactPayload(session),
    });

    await this.store.store({
      id: session.id,
      key: session.id,
      scope: STORE_SCOPE_STATE,
      summary: session.summary,
      status: session.status,
      trace: session.trace,
      updatedAt: session.updatedAt,
      payload: session,
    });

    await this.store.store({
      id: artifact.id,
      key: artifact.id,
      scope: STORE_SCOPE_ARTIFACTS,
      summary: artifact.summary,
      status: artifact.status,
      trace: artifact.trace,
      updatedAt: artifact.updatedAt,
      payload: artifact,
    });

    await this.telemetry.record({
      id: `telemetry-${session.id}`,
      summary: `Opened Discord ${session.kind} thread ${session.threadId}`,
      status: session.status,
      trace: session.trace,
      updatedAt: session.updatedAt,
      actorId,
      action: DISCORD_THREAD_SESSION_OPEN_ACTION,
      scope: DISCORD_THREAD_SESSION_TELEMETRY_SCOPE,
      details: {
        guildId: session.guildId,
        channelId: session.channelId,
        parentChannelId: session.parentChannelId,
        threadId: session.threadId,
        kind: session.kind,
        artifactId: artifact.id,
        pullRequestNumber: session.pullRequestNumber,
      },
    });

    return {
      session,
      artifactId: artifact.id,
      persistedKey: session.id,
    };
  }
}
