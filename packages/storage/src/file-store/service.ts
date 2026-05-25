import {
  mkdir,
  open,
  readFile,
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';

import { decodeWithCodec, type DevplatResult } from '@vannadii/devplat-core';

import { JSON_FILE_EXTENSION_PATTERN } from './constants.js';
import {
  buildStorageIndexPath,
  buildStoragePath,
  createStoredRecord,
  createStoredRecordIndexEntry,
  describeStoredRecord,
} from './logic.js';
import { StoredRecordCodec, StoredRecordIndexEntryCodec } from './codec.js';
import type {
  StoredRecord,
  StoredRecordIndexEntry,
  StoreIndexName,
  StoreScope,
} from './codec.js';

/**
 * File-backed implementation of the `.devplat` storage contract.
 */
export class FileStoreService {
  /**
   * Creates a file store rooted at the repository `.devplat` directory.
   */
  public constructor(
    private readonly rootDirectory = resolve(
      import.meta.dirname,
      '..',
      '..',
      '..',
      '..',
      '.devplat',
    ),
  ) {}

  /**
   * Persists a normalized record and its configured index entries.
   */
  public async store<TPayload extends object>(
    record: StoredRecord<TPayload>,
  ): Promise<StoredRecord<TPayload>> {
    const normalized = createStoredRecord(record);
    const filePath = resolve(
      this.rootDirectory,
      buildStoragePath(normalized.scope, normalized.key),
    );
    await mkdir(resolve(filePath, '..'), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(normalized, null, 2)}\n`,
      'utf8',
    );
    await Promise.all(
      (normalized.indexes ?? []).map(async (indexName) => {
        const indexPath = resolve(
          this.rootDirectory,
          buildStorageIndexPath(indexName, normalized.key),
        );
        await mkdir(resolve(indexPath, '..'), { recursive: true });
        await writeFile(
          indexPath,
          `${JSON.stringify(createStoredRecordIndexEntry(normalized), null, 2)}\n`,
          'utf8',
        );
      }),
    );
    return normalized;
  }

  /**
   * Persists a normalized record only when the target storage path does not exist.
   */
  public async storeIfAbsent<TPayload extends object>(
    record: StoredRecord<TPayload>,
  ): Promise<DevplatResult<StoredRecord<TPayload>>> {
    const normalized = createStoredRecord(record);
    const filePath = resolve(
      this.rootDirectory,
      buildStoragePath(normalized.scope, normalized.key),
    );
    let createdPrimaryRecord = false;
    try {
      await mkdir(resolve(filePath, '..'), { recursive: true });
      const handle = await open(filePath, 'wx');
      createdPrimaryRecord = true;
      try {
        await handle.writeFile(
          `${JSON.stringify(normalized, null, 2)}\n`,
          'utf8',
        );
      } finally {
        await handle.close();
      }
      await Promise.all(
        (normalized.indexes ?? []).map(async (indexName) => {
          const indexPath = resolve(
            this.rootDirectory,
            buildStorageIndexPath(indexName, normalized.key),
          );
          await mkdir(resolve(indexPath, '..'), { recursive: true });
          await writeFile(
            indexPath,
            `${JSON.stringify(createStoredRecordIndexEntry(normalized), null, 2)}\n`,
            'utf8',
          );
        }),
      );
      return {
        ok: true,
        value: normalized,
      };
    } catch (error) {
      if (createdPrimaryRecord) {
        try {
          await unlink(filePath);
        } catch {
          // Best-effort cleanup for partially persisted create-only writes.
        }
      }
      return {
        ok: false,
        error: String(error),
      };
    }
  }

  /**
   * Reads a record from disk and fails closed on invalid paths or payloads.
   */
  public async read(
    scope: StoreScope,
    key: string,
  ): Promise<DevplatResult<StoredRecord>> {
    try {
      const filePath = resolve(
        this.rootDirectory,
        buildStoragePath(scope, key),
      );
      const raw = await readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const decoded = decodeWithCodec(StoredRecordCodec, parsed);
      if (!decoded.ok) {
        return {
          ok: false,
          error: decoded.error,
        };
      }
      return {
        ok: true,
        value: decoded.value,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reads a secondary index entry without exposing `.devplat/indexes` paths.
   */
  public async readIndex(
    indexName: StoreIndexName,
    key: string,
  ): Promise<DevplatResult<StoredRecordIndexEntry>> {
    try {
      const filePath = resolve(
        this.rootDirectory,
        buildStorageIndexPath(indexName, key),
      );
      const raw = await readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const decoded = decodeWithCodec(StoredRecordIndexEntryCodec, parsed);
      if (!decoded.ok) {
        return {
          ok: false,
          error: decoded.error,
        };
      }
      return {
        ok: true,
        value: decoded.value,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Resolves a secondary index entry to the stored record it references.
   */
  public async readIndexedRecord(
    indexName: StoreIndexName,
    key: string,
  ): Promise<DevplatResult<StoredRecord>> {
    const indexEntry = await this.readIndex(indexName, key);
    if (!indexEntry.ok) {
      return indexEntry;
    }

    return this.read(indexEntry.value.scope, indexEntry.value.key);
  }

  /**
   * Lists JSON record keys for a storage scope.
   */
  public async list(scope: StoreScope): Promise<string[]> {
    const directory = resolve(this.rootDirectory, scope);
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(JSON_FILE_EXTENSION_PATTERN, ''))
      .sort((left, right) => left.localeCompare(right));
  }

  /**
   * Lists keys available under a secondary index.
   */
  public async listIndex(indexName: StoreIndexName): Promise<string[]> {
    const directory = resolve(this.rootDirectory, 'indexes', indexName);
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(JSON_FILE_EXTENSION_PATTERN, ''))
      .sort((left, right) => left.localeCompare(right));
  }

  /**
   * Describes a stored record for operator-facing output.
   */
  public explain<TPayload extends object>(
    input: StoredRecord<TPayload>,
  ): string {
    return describeStoredRecord(input);
  }
}
