import {
  ARTIFACT_TYPE_PULL_REQUEST_RECORD,
  ARTIFACT_TYPE_SLICE_PLAN,
  ARTIFACT_TYPE_SPEC_RECORD,
  type SupportedArtifactType,
} from '@vannadii/devplat-core';
import { ArtifactEnvelopeService } from '@vannadii/devplat-artifacts';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordThreadSession,
  describeDiscordThreadSession,
} from './logic.js';
import type {
  DiscordThreadKind,
  DiscordThreadSession,
  DiscordThreadSessionInput,
  DiscordThreadSessionResult,
} from './codec.js';

const THREAD_ARTIFACT_TYPE_BY_KIND: Record<
  DiscordThreadKind,
  SupportedArtifactType
> = {
  spec: ARTIFACT_TYPE_SPEC_RECORD,
  implementation: ARTIFACT_TYPE_SLICE_PLAN,
  'pull-request': ARTIFACT_TYPE_PULL_REQUEST_RECORD,
};

export class DiscordThreadSessionService {
  public constructor(
    private readonly artifacts = new ArtifactEnvelopeService(),
    private readonly telemetry = new TelemetryEventService(),
    private readonly store = new FileStoreService(),
  ) {}

  public execute(input: DiscordThreadSessionInput): DiscordThreadSession {
    return createDiscordThreadSession(input);
  }

  public explain(input: DiscordThreadSession): string {
    return describeDiscordThreadSession(input);
  }

  public async openThread(
    input: DiscordThreadSessionInput,
    actorId = 'discord-system',
  ): Promise<DiscordThreadSessionResult> {
    const session = this.execute(input);
    const artifactType = THREAD_ARTIFACT_TYPE_BY_KIND[session.kind];

    const artifact = this.artifacts.execute({
      id: session.artifactId,
      artifactType,
      version: 1,
      summary: `Discord ${session.kind} thread ${session.threadId}`,
      status: session.status,
      trace: session.trace,
      updatedAt: session.updatedAt,
      payload: {
        guildId: session.guildId,
        channelId: session.channelId,
        parentChannelId: session.parentChannelId,
        threadId: session.threadId,
        kind: session.kind,
        specId: session.specId,
        sliceId: session.sliceId,
        pullRequestNumber: session.pullRequestNumber,
      },
    });

    await this.store.store({
      id: session.id,
      key: session.id,
      scope: 'state',
      summary: session.summary,
      status: session.status,
      trace: session.trace,
      updatedAt: session.updatedAt,
      payload: session,
    });

    await this.store.store({
      id: artifact.id,
      key: artifact.id,
      scope: 'artifacts',
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
      action: 'open-thread',
      scope: 'discord',
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
