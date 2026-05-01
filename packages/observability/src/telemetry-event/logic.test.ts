import { describe, expect, it } from 'vitest';

import {
  createTelemetryAuditRecord,
  createTelemetryEvent,
  createTelemetryRunMetrics,
  createTelemetryRunSummary,
  describeTelemetryEvent,
} from './logic.js';
import type { TelemetryAuditRecord, TelemetryEvent } from './codec.js';

describe('TelemetryEvent logic', () => {
  const baseEvent: TelemetryEvent = {
    id: 'telemetry-001',
    summary: '  operator approved slice  ',
    status: 'complete',
    trace: [],
    updatedAt: '2026-04-04T00:00:00.000Z',
    actorId: 'user-123',
    action: 'approve-this',
    scope: 'discord',
    details: {
      threadId: 'thread-1',
    },
  };

  const cases = [
    {
      name: 'normalizes the summary and appends a telemetry trace marker',
      inputs: {
        event: baseEvent,
      },
      mock: () => undefined,
      assert: (inputs: { event: TelemetryEvent }) => {
        const event = createTelemetryEvent(inputs.event);

        expect(event.summary).toBe('operator approved slice');
        expect(event.trace).toContain('telemetry:discord:approve-this');
        expect(describeTelemetryEvent(event)).toContain('discord:approve-this');
      },
    },
    {
      name: 'summarizes run scope and failure counts from normalized events',
      inputs: {
        runId: ' run-1 ',
        events: [
          baseEvent,
          {
            ...baseEvent,
            id: 'telemetry-002',
            status: 'failed',
            scope: 'github',
            action: 'merge-pr',
          },
        ],
        startedAt: '2026-04-04T00:00:00.000Z',
        completedAt: '2026-04-04T00:02:00.000Z',
      },
      mock: () => undefined,
      assert: (inputs: {
        runId: string;
        events: readonly TelemetryEvent[];
        startedAt: string;
        completedAt: string;
      }) => {
        const summary = createTelemetryRunSummary(inputs);

        expect(summary.runId).toBe('run-1');
        expect(summary.eventIds).toEqual(['telemetry-001', 'telemetry-002']);
        expect(summary.scopes).toEqual(['discord', 'github']);
        expect(summary.actionCount).toBe(2);
        expect(summary.failedCount).toBe(1);
      },
    },
    {
      name: 'normalizes audit records with unique evidence artifacts',
      inputs: {
        auditRecord: {
          auditId: ' audit-001 ',
          runId: ' run-1 ',
          eventId: ' telemetry-001 ',
          actorId: ' user-123 ',
          action: ' approve-this ',
          scope: 'discord',
          outcome: 'approved',
          policyDecisionId: ' policy-1 ',
          reason: ' operator approved the slice ',
          artifactIds: [' artifact-1 ', 'artifact-1', ' artifact-2 '],
          recordedAt: '2026-04-04T00:01:00.000Z',
          details: {
            threadId: 'thread-1',
          },
        },
      },
      mock: () => undefined,
      assert: (inputs: { auditRecord: TelemetryAuditRecord }) => {
        const auditRecord = createTelemetryAuditRecord(inputs.auditRecord);

        expect(auditRecord.auditId).toBe('audit-001');
        expect(auditRecord.runId).toBe('run-1');
        expect(auditRecord.eventId).toBe('telemetry-001');
        expect(auditRecord.policyDecisionId).toBe('policy-1');
        expect(auditRecord.reason).toBe('operator approved the slice');
        expect(auditRecord.artifactIds).toEqual(['artifact-1', 'artifact-2']);
      },
    },
    {
      name: 'builds run metrics from events and audit records',
      inputs: {
        runId: ' run-1 ',
        events: [
          baseEvent,
          {
            ...baseEvent,
            id: 'telemetry-002',
            status: 'blocked',
            action: 'merge-now',
            scope: 'github',
            details: {
              artifactIds: ['artifact-3'],
              privileged: true,
            },
          },
        ],
        auditRecords: [
          {
            auditId: 'audit-001',
            runId: 'run-1',
            eventId: 'telemetry-002',
            actorId: 'user-123',
            action: 'merge-now',
            scope: 'github',
            outcome: 'blocked',
            reason: 'policy requires approval',
            artifactIds: ['artifact-2'],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
        ],
        startedAt: '2026-04-04T00:00:00.000Z',
        completedAt: '2026-04-04T00:02:00.000Z',
      },
      mock: () => undefined,
      assert: (inputs: {
        runId: string;
        events: readonly TelemetryEvent[];
        auditRecords: readonly TelemetryAuditRecord[];
        startedAt: string;
        completedAt: string;
      }) => {
        const metrics = createTelemetryRunMetrics(inputs);

        expect(metrics.runId).toBe('run-1');
        expect(metrics.durationMs).toBe(120000);
        expect(metrics.scopeCounts).toEqual([
          { scope: 'discord', count: 1 },
          { scope: 'github', count: 1 },
        ]);
        expect(metrics.statusCounts).toEqual([
          { status: 'blocked', count: 1 },
          { status: 'complete', count: 1 },
        ]);
        expect(metrics.privilegedActionCount).toBe(1);
        expect(metrics.blockedCount).toBe(1);
        expect(metrics.auditRecordIds).toEqual(['audit-001']);
        expect(metrics.artifactIds).toEqual(['artifact-2', 'artifact-3']);
      },
    },
    {
      name: 'builds run metrics when no audit records are available',
      inputs: {
        runId: ' run-1 ',
        events: [baseEvent],
        startedAt: '2026-04-04T00:00:00.000Z',
        completedAt: '2026-04-04T00:02:00.000Z',
      },
      mock: () => undefined,
      assert: (inputs: {
        runId: string;
        events: readonly TelemetryEvent[];
        startedAt: string;
        completedAt: string;
      }) => {
        const metrics = createTelemetryRunMetrics(inputs);

        expect(metrics.auditRecordIds).toEqual([]);
        expect(metrics.artifactIds).toEqual([]);
        expect(metrics.blockedCount).toBe(0);
      },
    },
    {
      name: 'attaches metrics and audit evidence to run summaries',
      inputs: {
        runId: ' run-1 ',
        events: [baseEvent],
        auditRecords: [
          {
            auditId: 'audit-001',
            runId: 'run-1',
            eventId: 'telemetry-001',
            actorId: 'user-123',
            action: 'approve-this',
            scope: 'discord',
            outcome: 'approved',
            reason: 'operator approved the slice',
            artifactIds: ['artifact-1'],
            recordedAt: '2026-04-04T00:01:00.000Z',
            details: {},
          },
        ],
        startedAt: '2026-04-04T00:00:00.000Z',
        completedAt: '2026-04-04T00:02:00.000Z',
      },
      mock: () => undefined,
      assert: (inputs: {
        runId: string;
        events: readonly TelemetryEvent[];
        auditRecords: readonly TelemetryAuditRecord[];
        startedAt: string;
        completedAt: string;
      }) => {
        const summary = createTelemetryRunSummary(inputs);

        expect(summary.auditRecordIds).toEqual(['audit-001']);
        expect(summary.artifactIds).toEqual(['artifact-1']);
        expect(summary.runMetrics.durationMs).toBe(120000);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();

      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  }
});
