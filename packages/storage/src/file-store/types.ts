import type { LifecycleStatus } from '@vannadii/devplat-core';

export type StoreScope = 'artifacts' | 'memory' | 'state' | 'telemetry';

export type StoreIndexName =
  | 'active-thread'
  | 'task'
  | 'pull-request'
  | 'branch'
  | 'artifact';

export interface StoredRecord<
  TPayload extends object = Record<string, unknown>,
> {
  id: string;
  key: string;
  scope: StoreScope;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  layoutVersion?: 1;
  indexes?: readonly StoreIndexName[];
  payload: TPayload;
}

export type StoredRecordSchema = StoredRecord;
