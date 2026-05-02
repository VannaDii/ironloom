import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { FileStoreService } from '@vannadii/devplat-storage';

import { DiscordChannelBindingService } from './service.js';
import type { DiscordChannelBinding } from './codec.js';

type DiscordChannelBindingServiceInputs =
  | {
      mode: 'bind';
      binding: DiscordChannelBinding;
      threadId: string;
      parentChannelId: string;
      actorId: string;
    }
  | {
      mode: 'explain';
      binding: DiscordChannelBinding;
    };

type DiscordChannelBindingServiceContext = {
  service: DiscordChannelBindingService;
  store: FileStoreService;
};

type DiscordChannelBindingServiceCase = {
  name: string;
  inputs: DiscordChannelBindingServiceInputs;
  mock: () => Promise<DiscordChannelBindingServiceContext>;
  assert: (
    context: DiscordChannelBindingServiceContext,
    inputs: DiscordChannelBindingServiceInputs,
  ) => Promise<void> | void;
};

async function createService(): Promise<DiscordChannelBindingServiceContext> {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
  const store = new FileStoreService(rootDirectory);

  return {
    service: new DiscordChannelBindingService(
      new TelemetryEventService(store),
      store,
    ),
    store,
  };
}

describe('DiscordChannelBindingService', () => {
  const cases = [
    {
      name: 'persists deterministic thread bindings and records telemetry',
      inputs: {
        mode: 'bind',
        binding: {
          id: 'binding-001',
          summary: 'Spec binding',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-spec',
          kind: 'spec',
          threadBindingMode: 'inherit-parent',
        },
        threadId: 'thread-1',
        parentChannelId: 'channel-spec',
        actorId: 'operator-1',
      },
      mock: createService,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'bind') {
          throw new Error('expected bind inputs');
        }

        const result = await context.service.bindThread(
          inputs.binding,
          inputs.threadId,
          inputs.parentChannelId,
          inputs.actorId,
        );

        expect(result.persistedKey).toBe('binding-001:thread-1');
        expect(result.routingKey).toBe('guild-1:spec:thread-1');
        expect(await context.store.list('state')).toContain(
          'binding-001:thread-1',
        );
        expect(await context.store.list('telemetry')).toContain(
          'telemetry-binding-001:thread-1',
        );
      },
    },
    {
      name: 'exposes explain helper output for bindings',
      inputs: {
        mode: 'explain',
        binding: {
          id: 'binding-002',
          summary: 'Audit binding',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-audit',
          kind: 'audit',
          threadBindingMode: 'inherit-parent',
        },
      },
      mock: createService,
      assert: (context, inputs) => {
        if (inputs.mode !== 'explain') {
          throw new Error('expected explain inputs');
        }

        const explanation = context.service.explain(inputs.binding);

        expect(explanation).toBe('audit:guild-1:channel-audit');
      },
    },
    {
      name: 'persists pull request thread bindings with deterministic routing keys',
      inputs: {
        mode: 'bind',
        binding: {
          id: 'binding-003',
          summary: 'Pull request binding',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-pr',
          kind: 'pull-request',
          threadBindingMode: 'inherit-parent',
        },
        threadId: 'thread-pr-1',
        parentChannelId: 'channel-pr',
        actorId: 'operator-2',
      },
      mock: createService,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'bind') {
          throw new Error('expected bind inputs');
        }

        const result = await context.service.bindThread(
          inputs.binding,
          inputs.threadId,
          inputs.parentChannelId,
          inputs.actorId,
        );

        expect(result.routingKey).toBe('guild-1:pull-request:thread-pr-1');
      },
    },
  ] satisfies DiscordChannelBindingServiceCase[];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});
