import * as t from 'io-ts';

import { LifecycleStatusCodec, type Exact } from '@vannadii/devplat-core';

import type { StoredRecordSchema } from './types.js';

export const StoreScopeCodec = t.union([
  t.literal('artifacts'),
  t.literal('memory'),
  t.literal('state'),
  t.literal('telemetry'),
]);

const StoreIndexNameCodec = t.union([
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

export type _StoredRecordExact = Exact<
  StoredRecordSchema,
  t.TypeOf<typeof StoredRecordCodec>
>;
