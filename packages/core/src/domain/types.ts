import type * as t from 'io-ts';

import type {
  DevplatErrorCodec,
  DevplatErrorKindCodec,
  DevplatErrorSeverityCodec,
  DevplatIdCodec,
  DomainSnapshotCodec,
  IsoTimestampCodec,
  LifecycleStatusCodec,
  RepositoryKeyCodec,
  TraceRecordCodec,
} from './codec.js';

export type LifecycleStatus = t.TypeOf<typeof LifecycleStatusCodec>;

export type TraceRecord = t.TypeOf<typeof TraceRecordCodec>;

export type DevplatId = t.TypeOf<typeof DevplatIdCodec>;

export type RepositoryKey = t.TypeOf<typeof RepositoryKeyCodec>;

export type IsoTimestamp = t.TypeOf<typeof IsoTimestampCodec>;

export type DevplatErrorKind = t.TypeOf<typeof DevplatErrorKindCodec>;

export type DevplatErrorSeverity = t.TypeOf<typeof DevplatErrorSeverityCodec>;

export type DevplatError = t.TypeOf<typeof DevplatErrorCodec>;

export type DomainSnapshot = t.TypeOf<typeof DomainSnapshotCodec>;

export type DevplatSuccess<T> = {
  ok: true;
  value: T;
};

export type DevplatFailure = {
  ok: false;
  error: string;
  diagnostic?: DevplatError;
};

export type DevplatResult<T> = DevplatSuccess<T> | DevplatFailure;
