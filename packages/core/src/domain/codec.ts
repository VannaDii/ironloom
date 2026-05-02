import * as t from 'io-ts';

import {
  ARTIFACT_TYPE_APPROVAL_RECORD,
  ARTIFACT_TYPE_AUDIT_LOG,
  ARTIFACT_TYPE_GATE_RUN_REPORT,
  ARTIFACT_TYPE_MERGE_DECISION,
  ARTIFACT_TYPE_PULL_REQUEST_RECORD,
  ARTIFACT_TYPE_REBASE_RESULT,
  ARTIFACT_TYPE_REMEDIATION_PLAN,
  ARTIFACT_TYPE_RESEARCH_BRIEF,
  ARTIFACT_TYPE_REVIEW_FINDING,
  ARTIFACT_TYPE_SLICE_PLAN,
  ARTIFACT_TYPE_SPEC_RECORD,
  ARTIFACT_TYPE_TASK_RECORD,
  ARTIFACT_TYPE_TELEMETRY_EVENT,
  ARTIFACT_TYPE_WORKTREE_ALLOCATION,
  GIT_BRANCH_DISALLOWED_CONTROL_OR_SPACE_PATTERN,
} from './constants.js';

/**
 * Brand carried by normalized DevPlat identifiers.
 */
export interface DevplatIdBrand {
  readonly DevplatId: unique symbol;
}

/**
 * Brand carried by normalized owner/repository keys.
 */
export interface RepositoryKeyBrand {
  readonly RepositoryKey: unique symbol;
}

/**
 * Brand marker retained for ISO timestamp documentation.
 */
export interface IsoTimestampBrand {
  readonly IsoTimestamp: unique symbol;
}

/**
 * Brand marker retained for Git branch name documentation.
 */
export interface GitBranchNameBrand {
  readonly GitBranchName: unique symbol;
}

/**
 * Returns true when a string is already trimmed and has at least one byte.
 */
function isNormalizedNonEmptyString(value: string): boolean {
  return value.trim() === value && value.length > 0;
}

/**
 * Returns true when a repository key uses the GitHub owner/repository shape.
 */
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

/**
 * Returns true when a timestamp round-trips through ISO-8601 milliseconds.
 */
function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return new Date(parsed).toISOString() === value;
}

/**
 * Returns true when a string is safe for use as a Git branch ref segment path.
 */
function isGitBranchName(value: string): boolean {
  return (
    isNormalizedNonEmptyString(value) &&
    value !== '@' &&
    !value.startsWith('-') &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value.endsWith('.') &&
    !value.includes('..') &&
    !value.includes('//') &&
    !value.includes('@{') &&
    !value.includes('\\') &&
    !value.includes('~') &&
    !value.includes('^') &&
    !value.includes(':') &&
    !value.includes('?') &&
    !value.includes('*') &&
    !value.includes('[') &&
    !value.split('/').some((segment) => segment.endsWith('.lock')) &&
    !GIT_BRANCH_DISALLOWED_CONTROL_OR_SPACE_PATTERN.test(value)
  );
}

/**
 * Codec for normalized DevPlat identifiers.
 */
export const DevplatIdCodec = t.brand(
  t.string,
  (value): value is t.Branded<string, DevplatIdBrand> =>
    isNormalizedNonEmptyString(value),
  'DevplatId',
);

/**
 * Codec for owner/repository identity keys.
 */
export const RepositoryKeyCodec = t.brand(
  t.string,
  (value): value is t.Branded<string, RepositoryKeyBrand> =>
    isRepositoryKey(value),
  'RepositoryKey',
);

/**
 * Codec for ISO-8601 timestamps with millisecond precision.
 */
export const IsoTimestampCodec = new t.Type<string, string, unknown>(
  'IsoTimestamp',
  (value): value is string => typeof value === 'string',
  (value, context) =>
    typeof value === 'string' && isIsoTimestamp(value)
      ? t.success(value)
      : t.failure(value, context),
  t.identity,
);

/**
 * Codec for Git branch names that satisfy Git ref naming constraints.
 */
export const GitBranchNameCodec = new t.Type<string, string, unknown>(
  'GitBranchName',
  (value): value is string => typeof value === 'string',
  (value, context) => {
    if (typeof value !== 'string') {
      return t.failure(value, context);
    }

    const normalized = value.trim();
    return isGitBranchName(normalized)
      ? t.success(normalized)
      : t.failure(value, context);
  },
  t.identity,
);

/**
 * Codec for all supported lifecycle artifact types.
 */
export const SupportedArtifactTypeCodec = t.union([
  t.literal(ARTIFACT_TYPE_APPROVAL_RECORD),
  t.literal(ARTIFACT_TYPE_AUDIT_LOG),
  t.literal(ARTIFACT_TYPE_GATE_RUN_REPORT),
  t.literal(ARTIFACT_TYPE_MERGE_DECISION),
  t.literal(ARTIFACT_TYPE_PULL_REQUEST_RECORD),
  t.literal(ARTIFACT_TYPE_REBASE_RESULT),
  t.literal(ARTIFACT_TYPE_REMEDIATION_PLAN),
  t.literal(ARTIFACT_TYPE_RESEARCH_BRIEF),
  t.literal(ARTIFACT_TYPE_REVIEW_FINDING),
  t.literal(ARTIFACT_TYPE_SLICE_PLAN),
  t.literal(ARTIFACT_TYPE_SPEC_RECORD),
  t.literal(ARTIFACT_TYPE_TASK_RECORD),
  t.literal(ARTIFACT_TYPE_TELEMETRY_EVENT),
  t.literal(ARTIFACT_TYPE_WORKTREE_ALLOCATION),
]);

/**
 * Codec for high-level lifecycle status values shared across records.
 */
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

/**
 * Codec for traceable lifecycle records.
 */
export const TraceRecordCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
});

/**
 * Codec for a traceable snapshot owned by a package domain.
 */
export const DomainSnapshotCodec = t.intersection([
  TraceRecordCodec,
  t.type({
    domain: t.string,
  }),
]);

/**
 * Codec for structured platform error categories.
 */
export const DevplatErrorKindCodec = t.union([
  t.literal('configuration'),
  t.literal('validation'),
  t.literal('policy-denied'),
  t.literal('not-found'),
  t.literal('external-service'),
  t.literal('execution'),
  t.literal('unknown'),
]);

/**
 * Codec for structured platform error severity.
 */
export const DevplatErrorSeverityCodec = t.union([
  t.literal('info'),
  t.literal('warning'),
  t.literal('error'),
  t.literal('fatal'),
]);

/**
 * Codec for structured platform errors returned through service boundaries.
 */
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

/** High-level lifecycle status shared across DevPlat records. */
export type LifecycleStatus = t.TypeOf<typeof LifecycleStatusCodec>;

/** Traceable lifecycle record. */
export type TraceRecord = t.TypeOf<typeof TraceRecordCodec>;

/** DevPlat identifier matching the shared ID pattern. */
export type DevplatId = t.TypeOf<typeof DevplatIdCodec>;

/** Repository-scoped runtime key. */
export type RepositoryKey = t.TypeOf<typeof RepositoryKeyCodec>;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = t.TypeOf<typeof IsoTimestampCodec>;

/** Valid Git branch name. */
export type GitBranchName = t.TypeOf<typeof GitBranchNameCodec>;

/** Supported lifecycle artifact type. */
export type SupportedArtifactType = t.TypeOf<typeof SupportedArtifactTypeCodec>;

/** Structured platform error kind. */
export type DevplatErrorKind = t.TypeOf<typeof DevplatErrorKindCodec>;

/** Structured platform error severity. */
export type DevplatErrorSeverity = t.TypeOf<typeof DevplatErrorSeverityCodec>;

/** Structured platform error returned through service boundaries. */
export type DevplatError = t.TypeOf<typeof DevplatErrorCodec>;

/** Traceable snapshot owned by one package domain. */
export type DomainSnapshot = t.TypeOf<typeof DomainSnapshotCodec>;

/** Successful DevPlat operation result. */
export type DevplatSuccess<T> = {
  ok: true;
  value: T;
};

/** Failed DevPlat operation result. */
export type DevplatFailure = {
  ok: false;
  error: string;
  diagnostic?: DevplatError;
};

/** Discriminated DevPlat operation result. */
export type DevplatResult<T> = DevplatSuccess<T> | DevplatFailure;
