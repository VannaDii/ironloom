import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const TelemetryScopeCodec = t.union([
  t.literal('discord'),
  t.literal('github'),
  t.literal('supervisor'),
  t.literal('storage'),
]);

export const TelemetryEventCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  actorId: t.string,
  action: t.string,
  scope: TelemetryScopeCodec,
  details: t.UnknownRecord,
});

export const TelemetryAuditOutcomeCodec = t.union([
  t.literal('approved'),
  t.literal('blocked'),
  t.literal('failed'),
  t.literal('completed'),
  t.literal('pending'),
]);

export const TelemetryAuditRecordCodec = t.intersection([
  t.type({
    auditId: t.string,
    runId: t.string,
    eventId: t.string,
    actorId: t.string,
    action: t.string,
    scope: TelemetryScopeCodec,
    outcome: TelemetryAuditOutcomeCodec,
    reason: t.string,
    artifactIds: t.array(t.string),
    recordedAt: t.string,
    details: t.UnknownRecord,
  }),
  t.partial({
    policyDecisionId: t.string,
  }),
]);

export const TelemetryScopeCountCodec = t.type({
  scope: TelemetryScopeCodec,
  count: t.number,
});

export const TelemetryStatusCountCodec = t.type({
  status: LifecycleStatusCodec,
  count: t.number,
});

export const TelemetryRunMetricsCodec = t.type({
  runId: t.string,
  durationMs: t.number,
  scopeCounts: t.array(TelemetryScopeCountCodec),
  statusCounts: t.array(TelemetryStatusCountCodec),
  privilegedActionCount: t.number,
  blockedCount: t.number,
  failedCount: t.number,
  auditRecordIds: t.array(t.string),
  artifactIds: t.array(t.string),
});

export const TelemetryRunSummaryCodec = t.type({
  runId: t.string,
  eventIds: t.array(t.string),
  scopes: t.array(TelemetryScopeCodec),
  actionCount: t.number,
  failedCount: t.number,
  auditRecordIds: t.array(t.string),
  artifactIds: t.array(t.string),
  runMetrics: TelemetryRunMetricsCodec,
  startedAt: t.string,
  completedAt: t.string,
});
