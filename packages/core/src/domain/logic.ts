import type {
  DevplatError,
  DevplatErrorKind,
  DomainSnapshot,
  TraceRecord,
} from './types.js';

export function appendTrace<TRecord extends TraceRecord>(
  record: TRecord,
  marker: string,
): TRecord {
  return {
    ...record,
    summary: record.summary.trim(),
    trace: [...record.trace, marker],
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

export function createDomainSnapshot(input: DomainSnapshot): DomainSnapshot {
  return appendTrace(input, `domain:${input.domain}`);
}

export function createDevplatError(input: {
  kind: DevplatErrorKind;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}): DevplatError {
  return {
    kind: input.kind,
    message: input.message.trim(),
    retryable: input.retryable ?? false,
    details: input.details ?? {},
  };
}

export function describeDomainSnapshot(input: DomainSnapshot): string {
  return `${input.domain} -> ${input.summary}`;
}
