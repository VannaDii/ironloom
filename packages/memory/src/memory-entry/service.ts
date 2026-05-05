import { FileStoreService } from '@vannadii/devplat-storage';

import { createMemoryEntry, describeMemoryEntry } from './logic.js';
import type { MemoryEntry } from './codec.js';

/** Memory entry service service. */
export class MemoryEntryService {
  public constructor(private readonly store = new FileStoreService()) {}

  /** Remember. */
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

  /** Executes the service operation. */
  public execute(input: MemoryEntry): Promise<MemoryEntry> {
    return this.remember(input);
  }

  /** Describes the service result for operators. */
  public explain(input: MemoryEntry): string {
    return describeMemoryEntry(input);
  }
}
