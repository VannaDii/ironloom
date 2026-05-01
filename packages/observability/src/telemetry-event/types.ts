import type * as t from 'io-ts';

import type {
  TelemetryAuditOutcomeCodec,
  TelemetryAuditRecordCodec,
  TelemetryEventCodec,
  TelemetryRunMetricsCodec,
  TelemetryRunSummaryCodec,
  TelemetryScopeCodec,
} from './codec.js';

export type TelemetryScope = t.TypeOf<typeof TelemetryScopeCodec>;

export type TelemetryEvent = t.TypeOf<typeof TelemetryEventCodec>;

export type TelemetryAuditOutcome = t.TypeOf<typeof TelemetryAuditOutcomeCodec>;

export type TelemetryAuditRecord = t.TypeOf<typeof TelemetryAuditRecordCodec>;

export type TelemetryRunMetrics = t.TypeOf<typeof TelemetryRunMetricsCodec>;

export type TelemetryRunSummary = t.TypeOf<typeof TelemetryRunSummaryCodec>;
