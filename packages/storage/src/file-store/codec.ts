import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const StoreScopeCodec = t.union([
  t.literal('artifacts'),
  t.literal('audit'),
  t.literal('gates'),
  t.literal('memory'),
  t.literal('pull-requests'),
  t.literal('remediation'),
  t.literal('reviews'),
  t.literal('slices'),
  t.literal('specs'),
  t.literal('state'),
  t.literal('tasks'),
  t.literal('telemetry'),
  t.literal('worktrees'),
]);

export const StoreIndexNameCodec = t.union([
  t.literal('active-thread'),
  t.literal('task'),
  t.literal('pull-request'),
  t.literal('branch'),
  t.literal('artifact'),
]);

export const StoredRecordCodec = t.intersection([
  t.type({
    id: t.string,
    key: t.string,
    scope: StoreScopeCodec,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    payload: t.UnknownRecord,
  }),
  t.partial({
    layoutVersion: t.literal(1),
    indexes: t.readonlyArray(StoreIndexNameCodec),
  }),
]);

export const StoredRecordIndexEntryCodec = t.type({
  id: t.string,
  scope: StoreScopeCodec,
  key: t.string,
  updatedAt: t.string,
});

export const StorageLayoutContractCodec = t.type({
  layoutVersion: t.literal(1),
  scopes: t.readonlyArray(StoreScopeCodec),
  indexes: t.readonlyArray(StoreIndexNameCodec),
});
