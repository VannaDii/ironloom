import { FileStoreService } from '@vannadii/devplat-storage';

import { createMemoryEntry, describeMemoryEntry } from './logic.js';
import type { MemoryEntry } from './codec.js';

export class MemoryEntryService {
  public constructor(private readonly store = new FileStoreService()) {}

  public async remember(input: MemoryEntry): Promise<MemoryEntry> {
    const entry = createMemoryEntry(input);
    await this.store.store({
      id: entry.memoryId,
      key: entry.memoryId,
      scope: 'memory',
      summary: entry.subject,
      status: 'approved',
      trace: [`memory:${entry.kind}`],
      updatedAt: entry.updatedAt,
      payload: entry,
    });
    return entry;
  }

  public execute(input: MemoryEntry): Promise<MemoryEntry> {
    return this.remember(input);
  }

  public explain(input: MemoryEntry): string {
    return describeMemoryEntry(input);
  }
}
