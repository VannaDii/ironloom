import * as t from 'io-ts';

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

export const DevplatErrorCodec = t.type({
  kind: DevplatErrorKindCodec,
  message: t.string,
  retryable: t.boolean,
  details: t.UnknownRecord,
});
