import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileStoreService } from '@vannadii/devplat-storage';

import { MemoryEntryService } from './service.js';
import type { MemoryEntry } from './types.js';

type MemoryEntryServiceContext = {
  rootDirectory: string;
  service: MemoryEntryService;
};

type MemoryEntryServiceCase = {
  name: string;
  inputs: {
    entry: MemoryEntry;
  };
  mock: () => Promise<MemoryEntryServiceContext>;
  assert: (
    context: MemoryEntryServiceContext,
    inputs: { entry: MemoryEntry },
  ) => Promise<void>;
};

describe('MemoryEntryService', () => {
  const cases = [
    {
      name: 'persists normalized memory entries through storage',
      inputs: {
        entry: {
          memoryId: 'memory-001',
          kind: 'constraint',
          subject: 'Only storage may access .devplat',
          detail: 'Filesystem access must stay isolated.',
          tags: ['storage', 'governance'],
          status: 'active',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(
          resolve(tmpdir(), 'devplat-memory-'),
        );

        return {
          rootDirectory,
          service: new MemoryEntryService(new FileStoreService(rootDirectory)),
        };
      },
      assert: async (context, inputs) => {
        const entry = await context.service.execute(inputs.entry);

        expect(entry.memoryId).toBe('memory-001');
        expect(
          await new FileStoreService(context.rootDirectory).list('memory'),
        ).toContain('memory-001');
        expect(context.service.explain(entry)).toContain('constraint memory');
      },
    },
  ] satisfies MemoryEntryServiceCase[];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});
