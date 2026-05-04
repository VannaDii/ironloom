import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

/**
 * Codec for the platform area that emitted telemetry.
 */
export const TelemetryScopeCodec = t.union([
  t.literal('discord'),
  t.literal('github'),
  t.literal('supervisor'),
  t.literal('storage'),
]);

/**
 * Codec for operational telemetry events emitted by platform services.
 */
export const TelemetryEventCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  actorId: t.string,
  action: t.string,
  scope: TelemetryScopeCodec,
  details: t.UnknownRecord,
});

/**
 * Codec for policy-relevant audit outcomes derived from telemetry.
 */
export const TelemetryAuditOutcomeCodec = t.union([
  t.literal('approved'),
  t.literal('blocked'),
  t.literal('failed'),
  t.literal('completed'),
  t.literal('pending'),
]);

/**
 * Codec for persisted audit records attached to telemetry events.
 */
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
    recordedAt: IsoTimestampCodec,
    details: t.UnknownRecord,
  }),
  t.partial({
    policyDecisionId: t.string,
  }),
]);

/**
 * Codec for telemetry counts grouped by platform scope.
 */
export const TelemetryScopeCountCodec = t.type({
  scope: TelemetryScopeCodec,
  count: t.number,
});

/**
 * Codec for telemetry counts grouped by lifecycle status.
 */
export const TelemetryStatusCountCodec = t.type({
  status: LifecycleStatusCodec,
  count: t.number,
});

/**
 * Codec for aggregated telemetry metrics for one run.
 */
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

/**
 * Codec for the telemetry summary captured for one platform run.
 */
export const TelemetryRunSummaryCodec = t.type({
  runId: t.string,
  eventIds: t.array(t.string),
  scopes: t.array(TelemetryScopeCodec),
  actionCount: t.number,
  failedCount: t.number,
  auditRecordIds: t.array(t.string),
  artifactIds: t.array(t.string),
  runMetrics: TelemetryRunMetricsCodec,
  startedAt: IsoTimestampCodec,
  completedAt: IsoTimestampCodec,
});

/** Area of the platform that emitted telemetry. */
export type TelemetryScope = t.TypeOf<typeof TelemetryScopeCodec>;

/** Operational event emitted by a DevPlat service. */
export type TelemetryEvent = t.TypeOf<typeof TelemetryEventCodec>;

/** Audit outcome recorded for a policy-relevant event. */
export type TelemetryAuditOutcome = t.TypeOf<typeof TelemetryAuditOutcomeCodec>;

/** Persisted audit record for a lifecycle-changing action. */
export type TelemetryAuditRecord = t.TypeOf<typeof TelemetryAuditRecordCodec>;

/** Aggregated metrics for one telemetry run. */
export type TelemetryRunMetrics = t.TypeOf<typeof TelemetryRunMetricsCodec>;

/** Summary of telemetry captured for one run. */
export type TelemetryRunSummary = t.TypeOf<typeof TelemetryRunSummaryCodec>;
