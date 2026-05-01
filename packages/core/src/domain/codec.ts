import * as t from 'io-ts';

export interface DevplatIdBrand {
  readonly DevplatId: unique symbol;
}

export interface RepositoryKeyBrand {
  readonly RepositoryKey: unique symbol;
}

export interface IsoTimestampBrand {
  readonly IsoTimestamp: unique symbol;
}

function isNormalizedNonEmptyString(value: string): boolean {
  return value.trim() === value && value.length > 0;
}

function isRepositoryKey(value: string): boolean {
  const segments = value.split('/');

  return (
    isNormalizedNonEmptyString(value) &&
    segments.length === 2 &&
    segments.every(
      (segment) => segment.trim() === segment && segment.length > 0,
    )
  );
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return new Date(parsed).toISOString() === value;
}

export const DevplatIdCodec = t.brand(
  t.string,
  (value): value is t.Branded<string, DevplatIdBrand> =>
    isNormalizedNonEmptyString(value),
  'DevplatId',
);

export const RepositoryKeyCodec = t.brand(
  t.string,
  (value): value is t.Branded<string, RepositoryKeyBrand> =>
    isRepositoryKey(value),
  'RepositoryKey',
);

export const IsoTimestampCodec = t.brand(
  t.string,
  (value): value is t.Branded<string, IsoTimestampBrand> =>
    isIsoTimestamp(value),
  'IsoTimestamp',
);

export const LifecycleStatusCodec = t.union([
  t.literal('draft'),
  t.literal('queued'),
  t.literal('claimed'),
  t.literal('running'),
  t.literal('review'),
  t.literal('blocked'),
  t.literal('approved'),
  t.literal('merge-ready'),
  t.literal('merged'),
  t.literal('failed'),
  t.literal('rebasing'),
  t.literal('complete'),
]);

export const TraceRecordCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
});

export const DomainSnapshotCodec = t.intersection([
  TraceRecordCodec,
  t.type({
    domain: t.string,
  }),
]);

export const DevplatErrorKindCodec = t.union([
  t.literal('configuration'),
  t.literal('validation'),
  t.literal('policy-denied'),
  t.literal('not-found'),
  t.literal('external-service'),
  t.literal('execution'),
  t.literal('unknown'),
]);

export const DevplatErrorSeverityCodec = t.union([
  t.literal('info'),
  t.literal('warning'),
  t.literal('error'),
  t.literal('fatal'),
]);

export const DevplatErrorCodec = t.intersection([
  t.type({
    kind: DevplatErrorKindCodec,
    message: t.string,
    retryable: t.boolean,
    details: t.UnknownRecord,
  }),
  t.partial({
    code: t.string,
    severity: DevplatErrorSeverityCodec,
    source: t.string,
  }),
]);
