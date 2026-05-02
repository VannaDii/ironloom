import { describe, expect, it } from 'vitest';

import {
  buildStoragePath,
  buildStorageIndexPath,
  createStorageLayoutContract,
  createStoredRecordIndexEntry,
  createStoredRecord,
  describeStoredRecord,
  assertSafeStoredRecordKey,
} from './logic.js';

describe('StoredRecord logic', () => {
  const cases = [
    {
      name: 'normalizes the summary and appends a storage trace marker',
      inputs: {
        record: {
          id: 'storage-001',
          key: 'telemetry-001',
          scope: 'telemetry',
          summary: '  telemetry event  ',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          indexes: ['active-thread', 'task'],
          payload: {},
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        record: Parameters<typeof createStoredRecord>[0];
      }) => {
        const record = createStoredRecord(inputs.record);

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
      },
    },
    {
      name: 'rejects unsafe storage keys before path construction',
      inputs: {
        record: {
          id: 'storage-003',
          key: '../escape',
          scope: 'state',
          summary: 'Unsafe key',
          status: 'blocked',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {},
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        record: Parameters<typeof createStoredRecord>[0];
      }) => {
        expect(() => createStoredRecord(inputs.record)).toThrow(
          'path separators',
        );
        expect(() => buildStoragePath('state', 'bad/key')).toThrow(
          'path separators',
        );
        expect(() => buildStorageIndexPath('task', 'bad\\key')).toThrow(
          'path separators',
        );
        expect(assertSafeStoredRecordKey('approval-1:artifact')).toBe(
          'approval-1:artifact',
        );
      },
    },
    {
      name: 'declares the full .devplat layout and normalized indexes',
      inputs: {
        record: {
          id: 'storage-002',
          key: 'thread-1',
          scope: 'specs',
          summary: 'Spec index',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {},
        },
      },
      mock: () => createStorageLayoutContract(),
      assert: (
        inputs: { record: Parameters<typeof createStoredRecordIndexEntry>[0] },
        layout: ReturnType<typeof createStorageLayoutContract>,
      ) => {
        expect(layout.scopes).toEqual([
          'artifacts',
          'audit',
          'gates',
          'memory',
          'pull-requests',
          'remediation',
          'reviews',
          'slices',
          'specs',
          'state',
          'tasks',
          'telemetry',
          'worktrees',
        ]);
        expect(layout.indexes).toEqual([
          'active-thread',
          'task',
          'pull-request',
          'branch',
          'artifact',
        ]);
        expect(createStoredRecordIndexEntry(inputs.record)).toEqual({
          id: 'storage-002',
          scope: 'specs',
          key: 'thread-1',
          updatedAt: '2026-04-04T00:00:00.000Z',
        });
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const mockResult = testCase.mock();

    testCase.assert(testCase.inputs, mockResult);
  });
});
