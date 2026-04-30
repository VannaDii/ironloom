import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { decodeWithCodec, type DevplatResult } from '@vannadii/devplat-core';

import {
  buildStorageIndexPath,
  buildStoragePath,
  createStoredRecord,
  createStoredRecordIndexEntry,
  describeStoredRecord,
} from './logic.js';
import { StoredRecordCodec } from './codec.js';
import type { StoredRecord, StoreScope } from './types.js';

export class FileStoreService {
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

  public async read(
    scope: StoreScope,
    key: string,
  ): Promise<DevplatResult<StoredRecord>> {
    const filePath = resolve(this.rootDirectory, buildStoragePath(scope, key));
    try {
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

  public async list(scope: StoreScope): Promise<string[]> {
    const directory = resolve(this.rootDirectory, scope);
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(/\.json$/u, ''))
      .sort((left, right) => left.localeCompare(right));
  }

  public explain<TPayload extends object>(
    input: StoredRecord<TPayload>,
  ): string {
    return describeStoredRecord(input);
  }
}
