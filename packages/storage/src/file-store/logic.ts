import { appendTrace } from '@vannadii/devplat-core';

import type {
  StoredRecord,
  StoredRecordIndexEntry,
  StorageLayoutContract,
  StoreIndexName,
  StoreScope,
} from './types.js';

export const storageScopes: readonly StoreScope[] = [
  'artifacts',
  'audit',
  'gates',
  'memory',
  'pull-requests',
  'remediation',
  'reviews',
  'slices',
  'specs',
  'state',
  'tasks',
  'telemetry',
  'worktrees',
];

export const storageIndexes: readonly StoreIndexName[] = [
  'active-thread',
  'task',
  'pull-request',
  'branch',
  'artifact',
];

export function createStorageLayoutContract(): StorageLayoutContract {
  return {
    layoutVersion: 1,
    scopes: storageScopes,
    indexes: storageIndexes,
  };
}

export function createStoredRecord<TPayload extends object>(
  input: StoredRecord<TPayload>,
): StoredRecord<TPayload> {
  return appendTrace(
    {
      ...input,
      layoutVersion: input.layoutVersion ?? 1,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `storage:${input.scope}`,
  );
}

export function buildStoragePath(scope: StoreScope, key: string): string {
  return `${scope}/${key}.json`;
}

export function buildStorageIndexPath(indexName: string, key: string): string {
  return `indexes/${indexName}/${key}.json`;
}

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

export function describeStoredRecord<TPayload extends object>(
  input: StoredRecord<TPayload>,
): string {
  return `${buildStoragePath(input.scope, input.key)} -> ${input.summary}`;
}
