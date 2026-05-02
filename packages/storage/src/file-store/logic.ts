import { appendTrace } from '@vannadii/devplat-core';

import {
  STORAGE_LAYOUT_VERSION,
  storageIndexes,
  storageScopes,
} from './constants.js';
import type {
  StoredRecord,
  StoredRecordIndexEntry,
  StorageLayoutContract,
  StoreIndexName,
  StoreScope,
} from './codec.js';

/**
 * Validates a storage key before it is interpolated into a file path.
 */
export function assertSafeStoredRecordKey(key: string): string {
  if (
    key.trim().length === 0 ||
    key.includes('/') ||
    key.includes('\\') ||
    key.includes('..')
  ) {
    throw new Error(
      'Stored record keys must not be empty or contain path separators or traversal segments.',
    );
  }

  return key;
}

/**
 * Builds the persisted storage layout contract for `.devplat`.
 */
export function createStorageLayoutContract(): StorageLayoutContract {
  return {
    layoutVersion: STORAGE_LAYOUT_VERSION,
    scopes: storageScopes,
    indexes: storageIndexes,
  };
}

/**
 * Normalizes a stored record and appends its storage trace marker.
 */
export function createStoredRecord<TPayload extends object>(
  input: StoredRecord<TPayload>,
): StoredRecord<TPayload> {
  return appendTrace(
    {
      ...input,
      key: assertSafeStoredRecordKey(input.key),
      layoutVersion: input.layoutVersion ?? STORAGE_LAYOUT_VERSION,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `storage:${input.scope}`,
  );
}

/**
 * Builds the relative path for a stored record.
 */
export function buildStoragePath(scope: StoreScope, key: string): string {
  return `${scope}/${assertSafeStoredRecordKey(key)}.json`;
}

/**
 * Builds the relative path for a stored index entry.
 */
export function buildStorageIndexPath(
  indexName: StoreIndexName,
  key: string,
): string {
  return `indexes/${indexName}/${assertSafeStoredRecordKey(key)}.json`;
}

/**
 * Creates a lookup index entry for a stored record.
 */
export function createStoredRecordIndexEntry<TPayload extends object>(
  input: StoredRecord<TPayload>,
): StoredRecordIndexEntry {
  return {
    id: input.id,
    scope: input.scope,
    key: input.key,
    updatedAt: new Date(input.updatedAt).toISOString(),
  };
}

/**
 * Describes a stored record for operator-facing output.
 */
export function describeStoredRecord<TPayload extends object>(
  input: StoredRecord<TPayload>,
): string {
  return `${buildStoragePath(input.scope, input.key)} -> ${input.summary}`;
}
