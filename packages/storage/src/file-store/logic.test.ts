import { describe, expect, it } from 'vitest';

import {
  buildStoragePath,
  buildStorageIndexPath,
  createStoredRecord,
  describeStoredRecord,
} from './logic.js';

describe('StoredRecord logic', () => {
  it('normalizes the summary and appends a storage trace marker', () => {
    const record = createStoredRecord({
      id: 'storage-001',
      key: 'telemetry-001',
      scope: 'telemetry',
      summary: '  telemetry event  ',
      status: 'complete',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      indexes: ['active-thread', 'task'],
      payload: {},
    });

    expect(record.summary).toBe('telemetry event');
    expect(record.layoutVersion).toBe(1);
    expect(record.indexes).toEqual(['active-thread', 'task']);
    expect(record.trace).toContain('storage:telemetry');
    expect(buildStoragePath('telemetry', 'telemetry-001')).toBe(
      'telemetry/telemetry-001.json',
    );
    expect(buildStorageIndexPath('task', 'telemetry-001')).toBe(
      'indexes/task/telemetry-001.json',
    );
    expect(describeStoredRecord(record)).toContain(
      'telemetry/telemetry-001.json',
    );
  });
});
