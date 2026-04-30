import { describe, expect, it } from 'vitest';

import {
  createTelemetryEvent,
  createTelemetryRunSummary,
  describeTelemetryEvent,
} from './logic.js';
import type { TelemetryEvent } from './types.js';

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
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();

      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  }
});
