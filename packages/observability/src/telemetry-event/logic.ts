import { appendTrace } from '@vannadii/devplat-core';

import type {
  TelemetryAuditRecord,
  TelemetryEvent,
  TelemetryRunMetrics,
  TelemetryRunSummary,
} from './codec.js';

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

function uniqueTrimmed(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ];
}

function extractArtifactIds(input: TelemetryEvent): string[] {
  const value = input.details['artifactIds'];
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueTrimmed(
    value.filter((artifactId): artifactId is string => {
      return typeof artifactId === 'string';
    }),
  );
}

function countByScope(
  events: readonly TelemetryEvent[],
): TelemetryRunMetrics['scopeCounts'] {
  const counts = new Map<TelemetryEvent['scope'], number>();
  for (const event of events) {
    counts.set(event.scope, (counts.get(event.scope) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scope, count]) => {
      return { scope, count };
    });
}

function countByStatus(
  events: readonly TelemetryEvent[],
): TelemetryRunMetrics['statusCounts'] {
  const counts = new Map<TelemetryEvent['status'], number>();
  for (const event of events) {
    counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => {
      return { status, count };
    });
}

export function createTelemetryAuditRecord(
  input: TelemetryAuditRecord,
): TelemetryAuditRecord {
  const normalized = {
    ...input,
    auditId: input.auditId.trim(),
    runId: input.runId.trim(),
    eventId: input.eventId.trim(),
    actorId: input.actorId.trim(),
    action: input.action.trim(),
    reason: input.reason.trim(),
    artifactIds: uniqueTrimmed(input.artifactIds),
    recordedAt: new Date(input.recordedAt).toISOString(),
  };

  if (input.policyDecisionId === undefined) {
    return normalized;
  }

  return {
    ...normalized,
    policyDecisionId: input.policyDecisionId.trim(),
  };
}

export function createTelemetryRunMetrics(input: {
  runId: string;
  events: readonly TelemetryEvent[];
  auditRecords?: readonly TelemetryAuditRecord[];
  startedAt: string;
  completedAt: string;
}): TelemetryRunMetrics {
  const events = input.events.map(createTelemetryEvent);
  const auditRecords = (input.auditRecords ?? []).map(
    createTelemetryAuditRecord,
  );
  const startedAt = new Date(input.startedAt);
  const completedAt = new Date(input.completedAt);
  const eventArtifactIds = events.flatMap(extractArtifactIds);
  const auditArtifactIds = auditRecords.flatMap((record) => record.artifactIds);

  return {
    runId: input.runId.trim(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    scopeCounts: countByScope(events),
    statusCounts: countByStatus(events),
    privilegedActionCount: events.filter((event) => {
      return event.details['privileged'] === true;
    }).length,
    blockedCount: auditRecords.filter((record) => {
      return record.outcome === 'blocked';
    }).length,
    failedCount: events.filter((event) => event.status === 'failed').length,
    auditRecordIds: auditRecords.map((record) => record.auditId),
    artifactIds: uniqueTrimmed([...auditArtifactIds, ...eventArtifactIds]),
  };
}

export function createTelemetryRunSummary(input: {
  runId: string;
  events: readonly TelemetryEvent[];
  auditRecords?: readonly TelemetryAuditRecord[];
  startedAt: string;
  completedAt: string;
}): TelemetryRunSummary {
  const events = input.events.map(createTelemetryEvent);
  const auditRecords = (input.auditRecords ?? []).map(
    createTelemetryAuditRecord,
  );
  const runMetrics = createTelemetryRunMetrics({
    ...input,
    events,
    auditRecords,
  });
  return {
    runId: input.runId.trim(),
    eventIds: events.map((event) => event.id),
    scopes: [...new Set(events.map((event) => event.scope))],
    actionCount: events.length,
    failedCount: events.filter((event) => event.status === 'failed').length,
    auditRecordIds: auditRecords.map((record) => record.auditId),
    artifactIds: runMetrics.artifactIds,
    runMetrics,
    startedAt: new Date(input.startedAt).toISOString(),
    completedAt: new Date(input.completedAt).toISOString(),
  };
}
