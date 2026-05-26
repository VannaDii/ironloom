import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { JSON_FILE_EXTENSION_PATTERN } from './constants.js';
import { FileStoreService } from './service.js';
import type { StoredRecord } from './codec.js';

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
      mode: 'index-lookup';
      records: StoredRecord<FileStorePayload>[];
    }
  | {
      mode: 'indexed-record';
      record: StoredRecord<FileStorePayload>;
    }
  | {
      mode: 'index-failure';
      record: StoredRecord<FileStorePayload>;
    }
  | {
      mode: 'failure';
    }
  | {
      mode: 'non-json-and-string-error';
    }
  | {
      mode: 'json-extension-pattern';
      filenames: string[];
    }
  | {
      mode: 'unsafe-key';
      record: StoredRecord<FileStorePayload>;
    }
  | {
      mode: 'store-if-absent';
      record: StoredRecord<FileStorePayload>;
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
      name: 'creates records in create-only mode when key is absent and rejects duplicates',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-atomic-001',
          key: 'atomic-key',
          scope: 'state',
          summary: 'Atomic record',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task'],
          payload: { state: 'atomic' },
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
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const first = await context.service.storeIfAbsent(inputs.record);
        const second = await context.service.storeIfAbsent({
          ...inputs.record,
          id: 'storage-atomic-002',
        });
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(false);
        await expect(
          readFile(
            resolve(context.rootDirectory, 'state', 'atomic-key.json'),
            'utf8',
          ),
        ).resolves.toContain('"id": "storage-atomic-001"');
        await expect(
          readFile(
            resolve(
              context.rootDirectory,
              'indexes',
              'task',
              'atomic-key.json',
            ),
            'utf8',
          ),
        ).resolves.toContain('"key": "atomic-key"');
      },
    },
    {
      name: 'returns a normalized string error when create-only serialization throws a non-Error value',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-atomic-string-error',
          key: 'atomic-string-error',
          scope: 'state',
          summary: 'Atomic record string error',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: { state: 'atomic' },
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
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const stringifySpy = vi
          .spyOn(JSON, 'stringify')
          .mockImplementationOnce(() => {
            throw 'serialization-failed';
          });
        try {
          const stored = await context.service.storeIfAbsent(inputs.record);
          expect(stored.ok).toBe(false);
          if (!stored.ok) {
            expect(stored.error).toBe('serialization-failed');
          }
        } finally {
          stringifySpy.mockRestore();
        }
      },
    },
    {
      name: 'fails create-only store-if-absent when an index entry already exists',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-if-absent-index-eexist',
          key: 'if-absent-index-eexist',
          scope: 'state',
          summary: 'Store once with existing index entry',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task'],
          payload: { state: 'index-eexist' },
        },
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));
        await mkdir(resolve(rootDirectory, 'indexes', 'task'), {
          recursive: true,
        });
        await writeFile(
          resolve(
            rootDirectory,
            'indexes',
            'task',
            'if-absent-index-eexist.json',
          ),
          '{"id":"previous"}\n',
          'utf8',
        );
        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (context, inputs) => {
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const stored = await context.service.storeIfAbsent(inputs.record);
        expect(stored.ok).toBe(false);
        await expect(
          readFile(
            resolve(
              context.rootDirectory,
              'state',
              'if-absent-index-eexist.json',
            ),
            'utf8',
          ),
        ).rejects.toThrow();
        await expect(
          readFile(
            resolve(
              context.rootDirectory,
              'indexes',
              'task',
              'if-absent-index-eexist.json',
            ),
            'utf8',
          ),
        ).resolves.toContain('"id":"previous"');
      },
    },
    {
      name: 'deduplicates duplicate indexes during create-only store-if-absent writes',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-if-absent-dedup-indexes',
          key: 'if-absent-dedup-indexes',
          scope: 'state',
          summary: 'Store once with duplicate indexes',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task', 'task'],
          payload: { state: 'dedup-indexes' },
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
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const stored = await context.service.storeIfAbsent(inputs.record);
        expect(stored.ok).toBe(true);
        await expect(
          readFile(
            resolve(
              context.rootDirectory,
              'indexes',
              'task',
              'if-absent-dedup-indexes.json',
            ),
            'utf8',
          ),
        ).resolves.toContain('"key": "if-absent-dedup-indexes"');
      },
    },
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
      name: 'rejects unsafe keys before writing files',
      inputs: {
        mode: 'unsafe-key',
        record: {
          id: 'storage-unsafe',
          key: '../outside',
          scope: 'state',
          summary: 'Unsafe storage key',
          status: 'blocked',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: { state: 'blocked' },
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
        if (inputs.mode !== 'unsafe-key') {
          throw new Error('expected unsafe-key inputs');
        }

        await expect(context.service.store(inputs.record)).rejects.toThrow(
          'path separators',
        );
        await expect(
          context.service.read('state', '../outside'),
        ).resolves.toMatchObject({
          ok: false,
        });
      },
    },
    {
      name: 'stores once with store-if-absent and fails subsequent writes',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-if-absent-001',
          key: 'if-absent-001',
          scope: 'state',
          summary: 'Store once',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: { state: 'once' },
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
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const first = await context.service.storeIfAbsent(inputs.record);
        const second = await context.service.storeIfAbsent(inputs.record);
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(false);
      },
    },
    {
      name: 'writes index entries for store-if-absent records',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-if-absent-002',
          key: 'if-absent-002',
          scope: 'state',
          summary: 'Store once with index',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task'],
          payload: { state: 'once-indexed' },
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
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const stored = await context.service.storeIfAbsent(inputs.record);
        const indexContents = JSON.parse(
          await readFile(
            resolve(
              context.rootDirectory,
              'indexes',
              'task',
              'if-absent-002.json',
            ),
            'utf8',
          ),
        );
        expect(stored.ok).toBe(true);
        expect(indexContents.key).toBe('if-absent-002');
      },
    },
    {
      name: 'cleans up primary record when store-if-absent index persistence fails',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-if-absent-003',
          key: 'if-absent-003',
          scope: 'state',
          summary: 'Store once with failing index persistence',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task'],
          payload: { state: 'once-index-fail' },
        },
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));
        await mkdir(resolve(rootDirectory, 'indexes'), { recursive: true });
        await writeFile(resolve(rootDirectory, 'indexes', 'task'), 'blocked');
        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (context, inputs) => {
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const stored = await context.service.storeIfAbsent(inputs.record);
        expect(stored.ok).toBe(false);
        await expect(
          readFile(
            resolve(context.rootDirectory, 'state', 'if-absent-003.json'),
            'utf8',
          ),
        ).rejects.toThrow();
      },
    },
    {
      name: 'rolls back created index entries when a later store-if-absent index write fails',
      inputs: {
        mode: 'store-if-absent',
        record: {
          id: 'storage-if-absent-004',
          key: 'if-absent-004',
          scope: 'state',
          summary: 'Store once with partial index failure',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task', 'pull-request'],
          payload: { state: 'once-partial-index-fail' },
        },
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));
        await mkdir(resolve(rootDirectory, 'indexes'), { recursive: true });
        await writeFile(
          resolve(rootDirectory, 'indexes', 'pull-request'),
          'blocked',
        );
        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (context, inputs) => {
        if (inputs.mode !== 'store-if-absent') {
          throw new Error('expected store-if-absent inputs');
        }
        const stored = await context.service.storeIfAbsent(inputs.record);
        expect(stored.ok).toBe(false);
        await expect(
          readFile(
            resolve(context.rootDirectory, 'state', 'if-absent-004.json'),
            'utf8',
          ),
        ).rejects.toThrow();
        await expect(
          readFile(
            resolve(
              context.rootDirectory,
              'indexes',
              'task',
              'if-absent-004.json',
            ),
            'utf8',
          ),
        ).rejects.toThrow();
      },
    },
    {
      name: 'reads and lists secondary index entries without direct path access',
      inputs: {
        mode: 'index-lookup',
        records: [
          {
            id: 'storage-index-b',
            key: 'z-indexed-record',
            scope: 'state',
            summary: 'z indexed record',
            status: 'complete',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            indexes: ['task'],
            payload: { state: 'z' },
          },
          {
            id: 'storage-index-a',
            key: 'a-indexed-record',
            scope: 'state',
            summary: 'a indexed record',
            status: 'complete',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            indexes: ['task'],
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
        if (inputs.mode !== 'index-lookup') {
          throw new Error('expected index-lookup inputs');
        }

        await context.service.store(inputs.records[0]);
        await context.service.store(inputs.records[1]);

        const entry = await context.service.readIndex(
          'task',
          'a-indexed-record',
        );

        expect(entry).toMatchObject({
          ok: true,
          value: {
            id: 'storage-index-a',
            key: 'a-indexed-record',
            scope: 'state',
          },
        });
        expect(await context.service.listIndex('task')).toEqual([
          'a-indexed-record',
          'z-indexed-record',
        ]);
      },
    },
    {
      name: 'reads stored records through secondary index ownership',
      inputs: {
        mode: 'indexed-record',
        record: {
          id: 'storage-indexed-record',
          key: 'task-indexed-record',
          scope: 'tasks',
          summary: 'Task indexed record',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task'],
          payload: { state: 'resolved' },
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
        if (inputs.mode !== 'indexed-record') {
          throw new Error('expected indexed-record inputs');
        }

        await context.service.store(inputs.record);
        const result = await context.service.readIndexedRecord(
          'task',
          'task-indexed-record',
        );

        expect(result).toMatchObject({
          ok: true,
          value: {
            id: 'storage-indexed-record',
            key: 'task-indexed-record',
            scope: 'tasks',
            payload: {
              state: 'resolved',
            },
          },
        });
      },
    },
    {
      name: 'fails closed for missing and invalid secondary index entries',
      inputs: {
        mode: 'index-failure',
        record: {
          id: 'storage-index-invalid',
          key: 'invalid-index-record',
          scope: 'state',
          summary: 'Invalid index record',
          status: 'failed',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['task'],
          payload: { state: 'failed' },
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
        if (inputs.mode !== 'index-failure') {
          throw new Error('expected index-failure inputs');
        }

        const missing = await context.service.readIndex('task', 'missing');
        const missingRecord = await context.service.readIndexedRecord(
          'task',
          'missing',
        );
        await context.service.store(inputs.record);
        await writeFile(
          resolve(
            context.rootDirectory,
            'indexes',
            'task',
            'invalid-index-record.json',
          ),
          JSON.stringify({ invalid: true }),
          'utf8',
        );
        const invalid = await context.service.readIndex(
          'task',
          'invalid-index-record',
        );
        await writeFile(
          resolve(
            context.rootDirectory,
            'indexes',
            'task',
            'string-error.json',
          ),
          JSON.stringify({
            id: 'storage-index-string-error',
            scope: 'state',
            key: 'string-error',
            updatedAt: '2026-04-04T00:00:00.000Z',
          }),
          'utf8',
        );
        const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
          throw 'index boom';
        });
        const stringError = await context.service.readIndex(
          'task',
          'string-error',
        );
        parseSpy.mockRestore();

        expect(missing.ok).toBe(false);
        expect(missingRecord.ok).toBe(false);
        expect(invalid.ok).toBe(false);
        expect(stringError).toEqual({ ok: false, error: 'index boom' });
        expect(await context.service.listIndex('artifact')).toEqual([]);
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
      name: 'strips JSON extensions with the tested file-name pattern',
      inputs: {
        mode: 'json-extension-pattern',
        filenames: ['task-1.json', 'task-2.txt'],
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));

        return {
          rootDirectory,
          service: new FileStoreService(rootDirectory),
        };
      },
      assert: async (_context, inputs) => {
        if (inputs.mode !== 'json-extension-pattern') {
          throw new Error('expected json-extension-pattern inputs');
        }

        expect(
          inputs.filenames[0].replace(JSON_FILE_EXTENSION_PATTERN, ''),
        ).toBe('task-1');
        expect(
          inputs.filenames[1].replace(JSON_FILE_EXTENSION_PATTERN, ''),
        ).toBe('task-2.txt');
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

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});
