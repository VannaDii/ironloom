import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { TaskRecordCodec, TaskTransitionEventCodec } from './codec.js';

describe('task queue codecs', () => {
  const cases = [
    {
      name: 'decode valid task queue payloads',
      inputs: {
        decoders: [
          {
            codec: TaskTransitionEventCodec,
            value: {
              toStatus: 'queued',
              action: 'create',
              reason: 'Created task task-1.',
              occurredAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: TaskRecordCodec,
            value: {
              id: 'queue-001',
              summary: 'Queue record.',
              status: 'queued',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-1',
              sliceId: 'slice-1',
              threadId: 'thread-1',
              transitions: [
                {
                  toStatus: 'queued',
                  action: 'create',
                  reason: 'Created task task-1.',
                  occurredAt: '2026-04-04T00:00:00.000Z',
                },
              ],
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject invalid task queue timestamps',
      inputs: {
        decoders: [
          {
            codec: TaskTransitionEventCodec,
            value: {
              toStatus: 'queued',
              action: 'create',
              reason: 'Created task task-1.',
              occurredAt: '2026-04-04',
            },
          },
          {
            codec: TaskRecordCodec,
            value: {
              id: 'queue-001',
              summary: 'Queue record.',
              status: 'queued',
              trace: [],
              updatedAt: 'April 4, 2026',
              taskId: 'task-1',
              sliceId: 'slice-1',
              threadId: 'thread-1',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
