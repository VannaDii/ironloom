import { appendTrace } from '@vannadii/devplat-core';

import type { TelemetryEvent, TelemetryRunSummary } from './types.js';

export function createTelemetryEvent(input: TelemetryEvent): TelemetryEvent {
  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `telemetry:${input.scope}:${input.action}`,
  );
}

export function describeTelemetryEvent(input: TelemetryEvent): string {
  return `${input.scope}:${input.action} -> ${input.summary}`;
}

export function createTelemetryRunSummary(input: {
  runId: string;
  events: readonly TelemetryEvent[];
  startedAt: string;
  completedAt: string;
}): TelemetryRunSummary {
  const events = input.events.map(createTelemetryEvent);
  return {
    runId: input.runId.trim(),
    eventIds: events.map((event) => event.id),
    scopes: [...new Set(events.map((event) => event.scope))],
    actionCount: events.length,
    failedCount: events.filter((event) => event.status === 'failed').length,
    startedAt: new Date(input.startedAt).toISOString(),
    completedAt: new Date(input.completedAt).toISOString(),
  };
}
