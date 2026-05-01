import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArtifactEnvelopeService } from '@vannadii/devplat-artifacts';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { FileStoreService } from '@vannadii/devplat-storage';

import { DiscordThreadSessionService } from './service.js';
import type { DiscordThreadSessionInput } from './codec.js';

type DiscordThreadSessionServiceInputs =
  | {
      mode: 'open';
      session: DiscordThreadSessionInput;
      expectedArtifactId: string;
      expectedStateKey?: string;
      expectedTelemetryKey?: string;
      expectedPayloadType?: string;
    }
  | {
      mode: 'execute';
      session: DiscordThreadSessionInput;
      expectedTrace: string;
      expectedExplanation: string;
    };

type DiscordThreadSessionServiceContext = {
  service: DiscordThreadSessionService;
  store: FileStoreService;
};

type DiscordThreadSessionServiceCase = {
  name: string;
  inputs: DiscordThreadSessionServiceInputs;
  mock: () => Promise<DiscordThreadSessionServiceContext>;
  assert: (
    context: DiscordThreadSessionServiceContext,
    inputs: DiscordThreadSessionServiceInputs,
  ) => Promise<void> | void;
};

async function createService(): Promise<DiscordThreadSessionServiceContext> {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
  const store = new FileStoreService(rootDirectory);

  return {
    service: new DiscordThreadSessionService(
      new ArtifactEnvelopeService(),
      new TelemetryEventService(store),
      store,
    ),
    store,
  };
}

describe('DiscordThreadSessionService', () => {
  const cases = [
    {
      name: 'opens spec threads with persisted state and artifacts',
      inputs: {
        mode: 'open',
        session: {
          id: 'thread-session-001',
          summary: 'Spec thread',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-1',
          parentChannelId: 'channel-spec',
          threadId: 'thread-1',
          kind: 'spec',
          specId: 'spec-1',
          sliceId: null,
          pullRequestNumber: null,
          artifactId: 'artifact-thread-1',
        },
        expectedArtifactId: 'artifact-thread-1',
        expectedStateKey: 'thread-session-001',
      },
      mock: createService,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'open') {
          throw new Error('expected open inputs');
        }

        const result = await context.service.openThread(inputs.session);

        expect(result.persistedKey).toBe(inputs.expectedStateKey);
        expect(result.artifactId).toBe(inputs.expectedArtifactId);
        expect(await context.store.list('state')).toContain(
          inputs.expectedStateKey,
        );
        expect(await context.store.list('artifacts')).toContain(
          inputs.expectedArtifactId,
        );
      },
    },
    {
      name: 'exposes helper methods for implementation thread sessions',
      inputs: {
        mode: 'execute',
        session: {
          id: 'thread-session-002',
          summary: '  Implementation thread  ',
          status: 'running',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-2',
          parentChannelId: 'channel-impl',
          threadId: 'thread-2',
          kind: 'implementation',
          specId: 'spec-1',
          sliceId: 'slice-1',
          pullRequestNumber: null,
          artifactId: 'artifact-thread-2',
        },
        expectedTrace: 'discord:thread:implementation:thread-2',
        expectedExplanation: 'implementation:thread-2',
      },
      mock: createService,
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute') {
          throw new Error('expected execute inputs');
        }

        const session = context.service.execute(inputs.session);

        expect(session.trace).toContain(inputs.expectedTrace);
        expect(context.service.explain(session)).toContain(
          inputs.expectedExplanation,
        );
      },
    },
    {
      name: 'opens implementation threads with implementation-specific artifacts',
      inputs: {
        mode: 'open',
        session: {
          id: 'thread-session-003',
          summary: 'Implementation thread',
          status: 'running',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-3',
          parentChannelId: 'channel-impl',
          threadId: 'thread-3',
          kind: 'implementation',
          specId: 'spec-2',
          sliceId: 'slice-2',
          pullRequestNumber: null,
          artifactId: 'artifact-thread-3',
        },
        expectedArtifactId: 'artifact-thread-3',
        expectedTelemetryKey: 'telemetry-thread-session-003',
      },
      mock: createService,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'open') {
          throw new Error('expected open inputs');
        }

        const result = await context.service.openThread(inputs.session);

        expect(result.artifactId).toBe(inputs.expectedArtifactId);
        expect(await context.store.list('artifacts')).toContain(
          inputs.expectedArtifactId,
        );
        expect(await context.store.list('telemetry')).toContain(
          inputs.expectedTelemetryKey,
        );
      },
    },
    {
      name: 'opens pull request threads with pull-request-specific artifacts',
      inputs: {
        mode: 'open',
        session: {
          id: 'thread-session-004',
          summary: 'Pull request thread',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-4',
          parentChannelId: 'channel-pr',
          threadId: 'thread-4',
          kind: 'pull-request',
          specId: null,
          sliceId: null,
          pullRequestNumber: 12,
          artifactId: 'artifact-thread-4',
        },
        expectedArtifactId: 'artifact-thread-4',
        expectedPayloadType: 'discord-pull-request-thread',
      },
      mock: createService,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'open') {
          throw new Error('expected open inputs');
        }

        const result = await context.service.openThread(inputs.session);

        expect(result.artifactId).toBe(inputs.expectedArtifactId);
        expect(await context.store.list('artifacts')).toContain(
          inputs.expectedArtifactId,
        );

        const artifactRecord = await context.store.read(
          'artifacts',
          inputs.expectedArtifactId,
        );

        expect(artifactRecord.ok).toBe(true);
        if (artifactRecord.ok && inputs.expectedPayloadType !== undefined) {
          expect(artifactRecord.value.payload).toMatchObject({
            artifactType: inputs.expectedPayloadType,
          });
        }
      },
    },
  ] satisfies DiscordThreadSessionServiceCase[];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});
