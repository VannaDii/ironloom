export type LifecycleStatus =
  | 'draft'
  | 'queued'
  | 'claimed'
  | 'running'
  | 'review'
  | 'blocked'
  | 'approved'
  | 'merge-ready'
  | 'merged'
  | 'failed'
  | 'rebasing'
  | 'complete';

export interface TraceRecord {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
}

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

export type DevplatErrorKind =
  | 'configuration'
  | 'validation'
  | 'policy-denied'
  | 'not-found'
  | 'external-service'
  | 'execution'
  | 'unknown';

export interface DevplatError {
  kind: DevplatErrorKind;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface DomainSnapshot extends TraceRecord {
  domain: string;
}

export interface DevplatSuccess<T> {
  ok: true;
  value: T;
}

export interface DevplatFailure {
  ok: false;
  error: string;
  diagnostic?: DevplatError;
}

export type DevplatResult<T> = DevplatSuccess<T> | DevplatFailure;

export type Exact<
  TExpected,
  TActual extends TExpected,
> = TExpected extends TActual ? true : never;
