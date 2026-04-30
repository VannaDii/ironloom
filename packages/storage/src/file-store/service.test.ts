import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { FileStoreService } from './service.js';

describe('FileStoreService', () => {
  it('writes and reads file-backed records inside the storage root', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));
    const service = new FileStoreService(rootDirectory);

    const stored = await service.store({
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
    });

    const fileContents = JSON.parse(
      await readFile(
        resolve(rootDirectory, 'state', 'decision-001.json'),
        'utf8',
      ),
    );
    const loaded = await service.read('state', 'decision-001');
    const indexContents = JSON.parse(
      await readFile(
        resolve(rootDirectory, 'indexes', 'task', 'decision-001.json'),
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
      expect(loaded.value.payload.state).toBe('queued');
    }
  });

  it('lists records in sorted order and explains stored paths', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));
    const service = new FileStoreService(rootDirectory);

    await service.store({
      id: 'storage-b',
      key: 'z-record',
      scope: 'state',
      summary: 'z record',
      status: 'complete',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: { state: 'z' },
    });
    const stored = await service.store({
      id: 'storage-a',
      key: 'a-record',
      scope: 'state',
      summary: 'a record',
      status: 'complete',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: { state: 'a' },
    });

    expect(await service.list('state')).toEqual(['a-record', 'z-record']);
    expect(service.explain(stored)).toContain('state/a-record.json');
  });

  it('returns failures for missing or invalid records', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));
    const service = new FileStoreService(rootDirectory);

    const missing = await service.read('state', 'missing-record');
    expect(missing.ok).toBe(false);
    expect(await service.list('telemetry')).toEqual([]);

    await writeFile(
      resolve(rootDirectory, 'state', 'broken.json'),
      JSON.stringify({ invalid: true }),
      'utf8',
    ).catch(async () => {
      await service.store({
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
        resolve(rootDirectory, 'state', 'broken.json'),
        JSON.stringify({ invalid: true }),
        'utf8',
      );
    });

    const invalid = await service.read('state', 'broken');
    expect(invalid.ok).toBe(false);
  });

  it('ignores non-json entries and stringifies non-Error failures', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-storage-'));
    const service = new FileStoreService(rootDirectory);

    await mkdir(resolve(rootDirectory, 'state', 'nested'), { recursive: true });
    await writeFile(
      resolve(rootDirectory, 'state', 'notes.txt'),
      'ignore',
      'utf8',
    );
    expect(await service.list('state')).toEqual([]);

    await writeFile(
      resolve(rootDirectory, 'state', 'string-error.json'),
      '{"valid":true}',
      'utf8',
    );

    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw 'boom';
    });
    const result = await service.read('state', 'string-error');
    parseSpy.mockRestore();

    expect(result).toEqual({ ok: false, error: 'boom' });
  });
});
