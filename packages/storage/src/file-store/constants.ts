import {
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

import type { StoreIndexName, StoreScope } from './types.js';

/**
 * Current storage layout version persisted with stored records.
 */
export const STORAGE_LAYOUT_VERSION = 1;

/**
 * File extension pattern stripped from persisted JSON record names.
 */
export const JSON_FILE_EXTENSION_PATTERN = /\.json$/u;

/**
 * Storage scopes created under `.devplat`.
 */
export const storageScopes: readonly StoreScope[] = [
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
];

/**
 * Secondary lookup indexes maintained under `.devplat/indexes`.
 */
export const storageIndexes: readonly StoreIndexName[] = [
  STORE_INDEX_ACTIVE_THREAD,
  STORE_INDEX_TASK,
  STORE_INDEX_PULL_REQUEST,
  STORE_INDEX_BRANCH,
  STORE_INDEX_ARTIFACT,
];
