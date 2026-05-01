import { isLeft } from 'fp-ts/lib/Either.js';
import type * as t from 'io-ts';

import {
  DevplatIdCodec,
  IsoTimestampCodec,
  RepositoryKeyCodec,
} from './codec.js';
import type {
  DevplatError,
  DevplatErrorKind,
  DevplatErrorSeverity,
  DevplatFailure,
  DevplatId,
  DevplatSuccess,
  DomainSnapshot,
  IsoTimestamp,
  RepositoryKey,
  TraceRecord,
} from './types.js';

function normalizeNonEmptyValue(name: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }

  return trimmed;
}

function decodeValueObject<TValue>(
  failureMessage: string,
  codec: t.Decoder<unknown, TValue>,
  value: unknown,
): TValue {
  const decoded = codec.decode(value);
  if (isLeft(decoded)) {
    throw new Error(failureMessage);
  }

  return decoded.right;
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
  code?: string;
  severity?: DevplatErrorSeverity;
  source?: string;
}): DevplatError {
  return {
    kind: input.kind,
    message: input.message.trim(),
    retryable: input.retryable ?? false,
    details: input.details ?? {},
    code: input.code?.trim() ?? input.kind,
    severity: input.severity ?? 'error',
    source: input.source?.trim() ?? 'devplat',
  };
}

export function createDevplatId(value: string): DevplatId {
  return decodeValueObject(
    'DevPlat id is invalid.',
    DevplatIdCodec,
    normalizeNonEmptyValue('DevPlat id', value),
  );
}

export function createRepositoryKey(value: string): RepositoryKey {
  const normalized = normalizeNonEmptyValue('Repository key', value);
  return decodeValueObject(
    'Repository key must use owner/repo format.',
    RepositoryKeyCodec,
    normalized,
  );
}

export function createIsoTimestamp(value: string): IsoTimestamp {
  const normalized = normalizeNonEmptyValue('ISO timestamp', value);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error('ISO timestamp must be a valid date.');
  }

  return decodeValueObject(
    'ISO timestamp is invalid.',
    IsoTimestampCodec,
    new Date(parsed).toISOString(),
  );
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
