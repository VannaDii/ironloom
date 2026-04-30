import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { FileStoreService } from './service.js';
import type { StoredRecord } from './types.js';

type FileStorePayload = {
  state: string;
};

type FileStoreServiceInputs =
  | {
      mode: 'store-read';
      record: StoredRecord<FileStorePayload>;
    }
  | {
      mode: 'list-explain';
      records: StoredRecord<FileStorePayload>[];
    }
  | {
      mode: 'failure';
    }
  | {
      mode: 'non-json-and-string-error';
    };

type FileStoreServiceContext = {
  rootDirectory: string;
  service: FileStoreService;
};

type FileStoreServiceCase = {
  name: string;
  inputs: FileStoreServiceInputs;
  mock: () => Promise<FileStoreServiceContext>;
  assert: (
    context: FileStoreServiceContext,
    inputs: FileStoreServiceInputs,
  ) => Promise<void>;
};

describe('FileStoreService', () => {
  const cases = [
    {
      name: 'writes and reads file-backed records inside the storage root',
      inputs: {
        mode: 'store-read',
        record: {
          id: 'storage-001',
          key: 'decision-001',
          scope: 'state',
          summary: 'Persisted state record',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task'],
          payload: {
            state: 'queued',
          },
        },
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));

        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (context, inputs) => {
        if (inputs.mode !== 'store-read') {
          throw new Error('expected store-read inputs');
        }

        const stored = await context.service.store(inputs.record);
        const fileContents = JSON.parse(
          await readFile(
            resolve(context.rootDirectory, 'state', 'decision-001.json'),
            'utf8',
          ),
        );
        const loaded = await context.service.read('state', 'decision-001');
        const indexContents = JSON.parse(
          await readFile(
            resolve(
              context.rootDirectory,
              'indexes',
              'task',
              'decision-001.json',
            ),
            'utf8',
          ),
        );

        expect(stored.trace).toContain('storage:state');
        expect(stored.layoutVersion).toBe(1);
        expect(fileContents.key).toBe('decision-001');
        expect(indexContents).toMatchObject({
          id: 'storage-001',
          scope: 'state',
          key: 'decision-001',
        });
        expect(loaded.ok).toBe(true);
        if (loaded.ok) {
          expect(loaded.value.payload).toEqual({ state: 'queued' });
        }
      },
    },
    {
      name: 'lists records in sorted order and explains stored paths',
      inputs: {
        mode: 'list-explain',
        records: [
          {
            id: 'storage-b',
            key: 'z-record',
            scope: 'state',
            summary: 'z record',
            status: 'complete',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            payload: { state: 'z' },
          },
          {
            id: 'storage-a',
            key: 'a-record',
            scope: 'state',
            summary: 'a record',
            status: 'complete',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            payload: { state: 'a' },
          },
        ],
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));

        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (context, inputs) => {
        if (inputs.mode !== 'list-explain') {
          throw new Error('expected list-explain inputs');
        }

        await context.service.store(inputs.records[0]);
        const stored = await context.service.store(inputs.records[1]);

        expect(await context.service.list('state')).toEqual([
          'a-record',
          'z-record',
        ]);
        expect(context.service.explain(stored)).toContain(
          'state/a-record.json',
        );
      },
    },
    {
      name: 'returns failures for missing or invalid records',
      inputs: {
        mode: 'failure',
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));

        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (context) => {
        const missing = await context.service.read('state', 'missing-record');

        expect(missing.ok).toBe(false);
        expect(await context.service.list('telemetry')).toEqual([]);

        await writeFile(
          resolve(context.rootDirectory, 'state', 'broken.json'),
          JSON.stringify({ invalid: true }),
          'utf8',
        ).catch(async () => {
          await context.service.store({
            id: 'placeholder',
            key: 'placeholder',
            scope: 'state',
            summary: 'placeholder',
            status: 'complete',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            payload: { state: 'ok' },
          });
          await writeFile(
            resolve(context.rootDirectory, 'state', 'broken.json'),
            JSON.stringify({ invalid: true }),
            'utf8',
          );
        });

        const invalid = await context.service.read('state', 'broken');

        expect(invalid.ok).toBe(false);
      },
    },
    {
      name: 'ignores non-json entries and stringifies non-Error failures',
      inputs: {
        mode: 'non-json-and-string-error',
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));

        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (context) => {
        await mkdir(resolve(context.rootDirectory, 'state', 'nested'), {
          recursive: true,
        });
        await writeFile(
          resolve(context.rootDirectory, 'state', 'notes.txt'),
          'ignore',
          'utf8',
        );
        expect(await context.service.list('state')).toEqual([]);

        await writeFile(
          resolve(context.rootDirectory, 'state', 'string-error.json'),
          '{"valid":true}',
          'utf8',
        );

        const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
          throw 'boom';
        });
        const result = await context.service.read('state', 'string-error');
        parseSpy.mockRestore();

        expect(result).toEqual({ ok: false, error: 'boom' });
      },
    },
  ] satisfies FileStoreServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      expect.hasAssertions();
      const context = await testCase.mock();

      await testCase.assert(context, testCase.inputs);
    });
  }
});
