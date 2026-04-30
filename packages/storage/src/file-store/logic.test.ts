import { describe, expect, it } from 'vitest';

import {
  buildStoragePath,
  buildStorageIndexPath,
  createStorageLayoutContract,
  createStoredRecordIndexEntry,
  createStoredRecord,
  describeStoredRecord,
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

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const mockResult = testCase.mock();

      testCase.assert(testCase.inputs, mockResult);
    });
  }
});
