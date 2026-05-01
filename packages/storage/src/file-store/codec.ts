import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
  STORE_INDEX_ACTIVE_THREAD,
  STORE_INDEX_ARTIFACT,
  STORE_INDEX_BRANCH,
  STORE_INDEX_PULL_REQUEST,
  STORE_INDEX_TASK,
  STORE_SCOPE_ARTIFACTS,
  STORE_SCOPE_AUDIT,
  STORE_SCOPE_GATES,
  STORE_SCOPE_MEMORY,
  STORE_SCOPE_PULL_REQUESTS,
  STORE_SCOPE_REMEDIATION,
  STORE_SCOPE_REVIEWS,
  STORE_SCOPE_SLICES,
  STORE_SCOPE_SPECS,
  STORE_SCOPE_STATE,
  STORE_SCOPE_TASKS,
  STORE_SCOPE_TELEMETRY,
  STORE_SCOPE_WORKTREES,
} from '@vannadii/devplat-core';

import { STORAGE_LAYOUT_VERSION } from './constants.js';

/**
 * Codec for valid `.devplat` storage scopes.
 */
export const StoreScopeCodec = t.union([
  t.literal(STORE_SCOPE_ARTIFACTS),
  t.literal(STORE_SCOPE_AUDIT),
  t.literal(STORE_SCOPE_GATES),
  t.literal(STORE_SCOPE_MEMORY),
  t.literal(STORE_SCOPE_PULL_REQUESTS),
  t.literal(STORE_SCOPE_REMEDIATION),
  t.literal(STORE_SCOPE_REVIEWS),
  t.literal(STORE_SCOPE_SLICES),
  t.literal(STORE_SCOPE_SPECS),
  t.literal(STORE_SCOPE_STATE),
  t.literal(STORE_SCOPE_TASKS),
  t.literal(STORE_SCOPE_TELEMETRY),
  t.literal(STORE_SCOPE_WORKTREES),
]);

/**
 * Codec for valid secondary storage index names.
 */
export const StoreIndexNameCodec = t.union([
  t.literal(STORE_INDEX_ACTIVE_THREAD),
  t.literal(STORE_INDEX_TASK),
  t.literal(STORE_INDEX_PULL_REQUEST),
  t.literal(STORE_INDEX_BRANCH),
  t.literal(STORE_INDEX_ARTIFACT),
]);

/**
 * Codec for persisted file store records.
 */
export const StoredRecordCodec = t.intersection([
  t.type({
    id: t.string,
    key: t.string,
    scope: StoreScopeCodec,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
    payload: t.UnknownRecord,
  }),
  t.partial({
    layoutVersion: t.literal(STORAGE_LAYOUT_VERSION),
    indexes: t.readonlyArray(StoreIndexNameCodec),
  }),
]);

/**
 * Codec for persisted secondary index entries.
 */
export const StoredRecordIndexEntryCodec = t.type({
  id: t.string,
  scope: StoreScopeCodec,
  key: t.string,
  updatedAt: IsoTimestampCodec,
});

/**
 * Codec for the storage layout contract.
 */
export const StorageLayoutContractCodec = t.type({
  layoutVersion: t.literal(STORAGE_LAYOUT_VERSION),
  scopes: t.readonlyArray(StoreScopeCodec),
  indexes: t.readonlyArray(StoreIndexNameCodec),
});
