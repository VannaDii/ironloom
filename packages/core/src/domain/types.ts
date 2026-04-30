import type * as t from 'io-ts';

import type {
  DevplatErrorCodec,
  DevplatErrorKindCodec,
  DomainSnapshotCodec,
  LifecycleStatusCodec,
  TraceRecordCodec,
} from './codec.js';

export type LifecycleStatus = t.TypeOf<typeof LifecycleStatusCodec>;

export type TraceRecord = t.TypeOf<typeof TraceRecordCodec>;

declare const devplatIdBrand: unique symbol;
declare const repositoryKeyBrand: unique symbol;
declare const isoTimestampBrand: unique symbol;

export type DevplatId = string & { readonly [devplatIdBrand]: 'DevplatId' };
export type RepositoryKey = string & {
  readonly [repositoryKeyBrand]: 'RepositoryKey';
};
export type IsoTimestamp = string & {
  readonly [isoTimestampBrand]: 'IsoTimestamp';
};

export type DevplatErrorKind = t.TypeOf<typeof DevplatErrorKindCodec>;

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
