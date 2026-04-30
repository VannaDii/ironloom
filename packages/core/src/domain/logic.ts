import type {
  DevplatError,
  DevplatErrorKind,
  DevplatFailure,
  DevplatSuccess,
  DomainSnapshot,
  TraceRecord,
} from './types.js';

function normalizeNonEmptyValue(name: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }

  return trimmed;
}

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

export function createDevplatId(value: string): string {
  return normalizeNonEmptyValue('DevPlat id', value);
}

export function createRepositoryKey(value: string): string {
  const normalized = normalizeNonEmptyValue('Repository key', value);
  const segments = normalized.split('/');
  if (
    segments.length !== 2 ||
    segments.some((segment) => segment.length === 0)
  ) {
    throw new Error('Repository key must use owner/repo format.');
  }

  return normalized;
}

export function createIsoTimestamp(value: string): string {
  return new Date(normalizeNonEmptyValue('ISO timestamp', value)).toISOString();
}

export function createDevplatSuccess<T>(value: T): DevplatSuccess<T> {
  return {
    ok: true,
    value,
  };
}

export function createDevplatFailure(input: {
  error: string;
  diagnostic?: DevplatError;
}): DevplatFailure {
  return {
    ok: false,
    error: input.error.trim(),
    ...(input.diagnostic === undefined ? {} : { diagnostic: input.diagnostic }),
  };
}

export function describeDomainSnapshot(input: DomainSnapshot): string {
  return `${input.domain} -> ${input.summary}`;
}
