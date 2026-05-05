import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createTelemetryAuditRecord,
  createTelemetryEvent,
  createTelemetryRunSummary,
  describeTelemetryEvent,
} from './logic.js';
import type {
  TelemetryAuditRecord,
  TelemetryEvent,
  TelemetryRunSummary,
} from './codec.js';

/** Status for audit record. */
function statusForAuditRecord(
  input: TelemetryAuditRecord,
): TelemetryEvent['status'] {
  switch (input.outcome) {
    case 'approved':
      return 'approved';
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'complete';
    case 'pending':
      return 'running';
  }
}

/** Status for run summary. */
function statusForRunSummary(
  input: TelemetryRunSummary,
): TelemetryEvent['status'] {
  if (input.runMetrics.failedCount > 0) {
    return 'failed';
  }
  if (input.runMetrics.blockedCount > 0) {
    return 'blocked';
  }
  return 'complete';
}

/** Telemetry event service service. */
export class TelemetryEventService {
  public constructor(private readonly store = new FileStoreService()) {}

  /** Records the service result. */
  public async record(input: TelemetryEvent): Promise<TelemetryEvent> {
    const event = createTelemetryEvent(input);
    await this.store.store({
      id: event.id,
      key: event.id,
      scope: 'telemetry',
      summary: event.summary,
      status: event.status,
      trace: event.trace,
      updatedAt: event.updatedAt,
      payload: event,
    });
    return event;
  }

  /** Executes the service operation. */
  public execute(input: TelemetryEvent): Promise<TelemetryEvent> {
    return this.record(input);
  }

  /** Record audit. */
  public async recordAudit(
    input: TelemetryAuditRecord,
  ): Promise<TelemetryAuditRecord> {
    const auditRecord = createTelemetryAuditRecord(input);
    await this.store.store({
      id: auditRecord.auditId,
      key: auditRecord.auditId,
      scope: 'audit',
      summary: auditRecord.reason,
      status: statusForAuditRecord(auditRecord),
      trace: [`telemetry:audit:${auditRecord.scope}:${auditRecord.action}`],
      updatedAt: auditRecord.recordedAt,
      payload: auditRecord,
      indexes: ['artifact'],
    });
    return auditRecord;
  }

  /** Summarize run. */
  public async summarizeRun(input: {
    runId: string;
    events: readonly TelemetryEvent[];
    auditRecords?: readonly TelemetryAuditRecord[];
    startedAt: string;
    completedAt: string;
  }): Promise<TelemetryRunSummary> {
    const summary = createTelemetryRunSummary(input);
    await this.store.store({
      id: summary.runId,
      key: summary.runId,
      scope: 'telemetry',
      summary: `Telemetry run ${summary.runId}`,
      status: statusForRunSummary(summary),
      trace: [`telemetry:run-summary:${summary.runId}`],
      updatedAt: summary.completedAt,
      payload: summary,
    });
    return summary;
  }

  /** Describes the service result for operators. */
  public explain(input: TelemetryEvent): string {
    return describeTelemetryEvent(input);
  }
}
