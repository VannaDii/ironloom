import type * as t from 'io-ts';

import type {
  StoredRecordCodec,
  StoreIndexNameCodec,
  StoreScopeCodec,
} from './codec.js';

export type StoreScope = t.TypeOf<typeof StoreScopeCodec>;

export type StoreIndexName = t.TypeOf<typeof StoreIndexNameCodec>;

export type StoredRecord<TPayload extends object = Record<string, unknown>> =
  Omit<t.TypeOf<typeof StoredRecordCodec>, 'payload'> & {
    payload: TPayload;
  };

export interface StoredRecordIndexEntry {
  id: string;
  scope: StoreScope;
  key: string;
  updatedAt: string;
}

export interface StorageLayoutContract {
  layoutVersion: 1;
  scopes: readonly StoreScope[];
  indexes: readonly StoreIndexName[];
}
