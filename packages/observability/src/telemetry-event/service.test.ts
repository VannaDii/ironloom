import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileStoreService } from '@vannadii/devplat-storage';

import { TelemetryEventService } from './service.js';
import type { TelemetryAuditRecord, TelemetryEvent } from './codec.js';

type TelemetryEventServiceContext = {
  service: TelemetryEventService;
  store: FileStoreService;
};

type TelemetryEventServiceInputs = {
  mode: 'record' | 'execute' | 'recordAudit' | 'summarizeRun';
  event: TelemetryEvent;
  auditRecord?: TelemetryAuditRecord;
  auditRecords?: readonly TelemetryAuditRecord[];
};

type TelemetryEventServiceCase = {
  name: string;
  inputs: TelemetryEventServiceInputs;
  mock: () => Promise<TelemetryEventServiceContext>;
  assert: (
    context: TelemetryEventServiceContext,
    inputs: TelemetryEventServiceInputs,
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
      name: 'records audit decisions through the audit storage scope',
      inputs: {
        mode: 'recordAudit',
        event: {
          id: 'telemetry-003',
          summary: 'merge blocked',
          status: 'blocked',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-789',
          action: 'merge-now',
          scope: 'github',
          details: {},
        },
        auditRecord: {
          auditId: ' audit-003 ',
          runId: 'run-1',
          eventId: 'telemetry-003',
          actorId: 'user-789',
          action: 'merge-now',
          scope: 'github',
          outcome: 'blocked',
          reason: ' policy denied merge ',
          artifactIds: ['artifact-merge-1'],
          recordedAt: '2026-04-04T00:01:00.000Z',
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
        const auditRecord = await context.service.recordAudit(
          inputs.auditRecord ?? {
            auditId: 'audit-missing',
            runId: 'run-missing',
            eventId: 'event-missing',
            actorId: 'actor-missing',
            action: 'action-missing',
            scope: 'storage',
            outcome: 'failed',
            reason: 'missing fixture',
            artifactIds: [],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
        );

        expect(auditRecord.auditId).toBe('audit-003');
        expect(auditRecord.reason).toBe('policy denied merge');
        expect(await context.store.list('audit')).toContain('audit-003');
      },
    },
    {
      name: 'maps every audit outcome to persisted lifecycle status',
      inputs: {
        mode: 'recordAudit',
        event: {
          id: 'telemetry-005',
          summary: 'audit outcomes',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-789',
          action: 'audit-outcomes',
          scope: 'storage',
          details: {},
        },
        auditRecords: [
          {
            auditId: 'audit-approved',
            runId: 'run-outcomes',
            eventId: 'telemetry-005',
            actorId: 'user-789',
            action: 'approve-this',
            scope: 'discord',
            outcome: 'approved',
            reason: 'approved',
            artifactIds: [],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
          {
            auditId: 'audit-failed',
            runId: 'run-outcomes',
            eventId: 'telemetry-005',
            actorId: 'user-789',
            action: 'retry-gates',
            scope: 'github',
            outcome: 'failed',
            reason: 'failed',
            artifactIds: [],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
          {
            auditId: 'audit-completed',
            runId: 'run-outcomes',
            eventId: 'telemetry-005',
            actorId: 'user-789',
            action: 'release-worktree',
            scope: 'storage',
            outcome: 'completed',
            reason: 'completed',
            artifactIds: [],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
          {
            auditId: 'audit-pending',
            runId: 'run-outcomes',
            eventId: 'telemetry-005',
            actorId: 'user-789',
            action: 'merge-now',
            scope: 'supervisor',
            outcome: 'pending',
            reason: 'pending',
            artifactIds: [],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
        ],
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
        const records = inputs.auditRecords ?? [];
        for (const record of records) {
          await context.service.recordAudit(record);
        }

        const statuses = await Promise.all(
          records.map(async (record) => {
            const result = await context.store.read('audit', record.auditId);
            expect(result.ok).toBe(true);
            if (result.ok) {
              return result.value.status;
            }
            return 'failed';
          }),
        );

        expect(statuses).toEqual(['approved', 'failed', 'complete', 'running']);
      },
    },
    {
      name: 'summarizes runs with persisted metrics evidence',
      inputs: {
        mode: 'summarizeRun',
        event: {
          id: 'telemetry-004',
          summary: 'release published',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-789',
          action: 'publish',
          scope: 'github',
          details: {
            privileged: true,
          },
        },
        auditRecords: [
          {
            auditId: 'audit-004',
            runId: 'run-2',
            eventId: 'telemetry-004',
            actorId: 'user-789',
            action: 'publish',
            scope: 'github',
            outcome: 'completed',
            reason: 'publish completed',
            artifactIds: ['artifact-publish-1'],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
        ],
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
        const summary = await context.service.summarizeRun({
          runId: 'run-2',
          events: [inputs.event],
          auditRecords: inputs.auditRecords ?? [],
          startedAt: '2026-04-04T00:00:00.000Z',
          completedAt: '2026-04-04T00:02:00.000Z',
        });

        expect(summary.runMetrics.privilegedActionCount).toBe(1);
        expect(summary.artifactIds).toEqual(['artifact-publish-1']);
        expect(await context.store.list('telemetry')).toContain('run-2');
      },
    },
    {
      name: 'persists failed and blocked run summary statuses',
      inputs: {
        mode: 'summarizeRun',
        event: {
          id: 'telemetry-006',
          summary: 'gate failed',
          status: 'failed',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-789',
          action: 'run-gates',
          scope: 'supervisor',
          details: {},
        },
        auditRecords: [
          {
            auditId: 'audit-blocked-run',
            runId: 'run-blocked',
            eventId: 'telemetry-006',
            actorId: 'user-789',
            action: 'merge-now',
            scope: 'github',
            outcome: 'blocked',
            reason: 'merge blocked',
            artifactIds: [],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
        ],
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
        await context.service.summarizeRun({
          runId: 'run-failed',
          events: [inputs.event],
          startedAt: '2026-04-04T00:00:00.000Z',
          completedAt: '2026-04-04T00:02:00.000Z',
        });
        await context.service.summarizeRun({
          runId: 'run-blocked',
          events: [
            {
              ...inputs.event,
              id: 'telemetry-007',
              status: 'complete',
            },
          ],
          auditRecords: inputs.auditRecords ?? [],
          startedAt: '2026-04-04T00:00:00.000Z',
          completedAt: '2026-04-04T00:02:00.000Z',
        });

        const failedRun = await context.store.read('telemetry', 'run-failed');
        const blockedRun = await context.store.read('telemetry', 'run-blocked');

        expect(failedRun.ok).toBe(true);
        expect(blockedRun.ok).toBe(true);
        if (failedRun.ok && blockedRun.ok) {
          expect(failedRun.value.status).toBe('failed');
          expect(blockedRun.value.status).toBe('blocked');
        }
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

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});
