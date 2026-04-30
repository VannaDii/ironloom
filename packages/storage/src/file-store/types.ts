import type * as t from 'io-ts';

import type {
  StoredRecordCodec,
  StoredRecordIndexEntryCodec,
  StorageLayoutContractCodec,
  StoreIndexNameCodec,
  StoreScopeCodec,
} from './codec.js';

export type StoreScope = t.TypeOf<typeof StoreScopeCodec>;

export type StoreIndexName = t.TypeOf<typeof StoreIndexNameCodec>;

export type StoredRecord<TPayload extends object = Record<string, unknown>> =
  Omit<t.TypeOf<typeof StoredRecordCodec>, 'payload'> & {
    payload: TPayload;
  };

export type StoredRecordIndexEntry = t.TypeOf<
  typeof StoredRecordIndexEntryCodec
>;

export type StorageLayoutContract = t.TypeOf<typeof StorageLayoutContractCodec>;
