import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileStoreService } from '@vannadii/devplat-storage';

import { TelemetryEventService } from './service.js';
import type { TelemetryEvent } from './types.js';

type TelemetryEventServiceContext = {
  service: TelemetryEventService;
  store: FileStoreService;
};

type TelemetryEventServiceCase = {
  name: string;
  inputs: {
    mode: 'record' | 'execute';
    event: TelemetryEvent;
  };
  mock: () => Promise<TelemetryEventServiceContext>;
  assert: (
    context: TelemetryEventServiceContext,
    inputs: { mode: 'record' | 'execute'; event: TelemetryEvent },
  ) => Promise<void>;
};

describe('TelemetryEventService', () => {
  const cases = [
    {
      name: 'records telemetry through the storage package',
      inputs: {
        mode: 'record',
        event: {
          id: 'telemetry-001',
          summary: 'discord approval',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-123',
          action: 'approve-this',
          scope: 'discord',
          details: {},
        },
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-observability-'),
        );
        const store = new FileStoreService(rootDirectory);

        return {
          service: new TelemetryEventService(store),
          store,
        };
      },
      assert: async (context, inputs) => {
        const event = await context.service.record(inputs.event);

        expect(event.trace).toContain('telemetry:discord:approve-this');
      },
    },
    {
      name: 'covers execute and explain helpers',
      inputs: {
        mode: 'execute',
        event: {
          id: 'telemetry-002',
          summary: 'retry gates',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-456',
          action: 'retry-gates',
          scope: 'discord',
          details: {},
        },
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-observability-'),
        );
        const store = new FileStoreService(rootDirectory);

        return {
          service: new TelemetryEventService(store),
          store,
        };
      },
      assert: async (context, inputs) => {
        const event = await context.service.execute(inputs.event);

        expect(context.service.explain(event)).toContain('retry-gates');
        expect(await context.store.list('telemetry')).toContain(
          'telemetry-002',
        );
      },
    },
  ] satisfies TelemetryEventServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      expect.hasAssertions();
      const context = await testCase.mock();

      await testCase.assert(context, testCase.inputs);
    });
  }
});
