import { describe, expect, it } from 'vitest';

import {
  claimTask,
  createTaskTransitionEvent,
  createTaskRecord,
  describeTaskRecord,
  updateTaskStatus,
} from './logic.js';
import type { TaskRecord } from './types.js';

const baseTask: TaskRecord = {
  id: 'queue-001',
  summary: '  queue record  ',
  status: 'queued',
  trace: [],
  updatedAt: '2026-04-04T00:00:00.000Z',
  taskId: 'task-1',
  sliceId: 'slice-1',
  threadId: 'thread-1',
};

describe('TaskRecord logic', () => {
  it('claims a queued task', () => {
    const record = claimTask(createTaskRecord(baseTask), 'worker-1');
    expect(record.status).toBe('claimed');
    expect(record.assigneeId).toBe('worker-1');
  });

  it('updates lifecycle status with trace markers', () => {
    const record = updateTaskStatus(createTaskRecord(baseTask), 'running');
    expect(record.trace).toContain('queue:task-1:running');
    expect(describeTaskRecord(record)).toContain('task-1:running');
  });

  it('records durable lifecycle transitions for claims and completion', () => {
    const cases = [
      {
        inputs: {
          record: createTaskRecord(baseTask),
        },
        mock: () => undefined,
        assert: (record: ReturnType<typeof updateTaskStatus>) => {
          expect(record.transitions?.map((event) => event.action)).toEqual([
            'create',
            'claim',
            'complete',
          ]);
          expect(record.transitions?.at(-1)?.reason).toBe(
            'Moved task task-1 to complete',
          );
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      const claimed = claimTask(testCase.inputs.record, 'worker-2');
      const completed = updateTaskStatus(claimed, 'complete');
      testCase.assert(completed);
    }

    const transitionCases = [
      {
        inputs: {
          transition: {
            toStatus: 'queued',
            action: 'create',
            reason: '  queued  ',
            occurredAt: '2026-04-04T00:00:00.000Z',
          },
        },
        mock: () => undefined,
        assert: (event: ReturnType<typeof createTaskTransitionEvent>) => {
          expect(event.reason).toBe('queued');
        },
      },
    ];

    for (const testCase of transitionCases) {
      testCase.mock();
      testCase.assert(createTaskTransitionEvent(testCase.inputs.transition));
    }
  });

  it('marks blocked and failed status updates as block transitions', () => {
    const cases = [
      {
        inputs: {
          status: 'blocked',
        },
        mock: () => undefined,
        assert: (record: ReturnType<typeof updateTaskStatus>) => {
          expect(record.transitions?.at(-1)?.action).toBe('block');
        },
      },
      {
        inputs: {
          status: 'failed',
        },
        mock: () => undefined,
        assert: (record: ReturnType<typeof updateTaskStatus>) => {
          expect(record.transitions?.at(-1)?.action).toBe('block');
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(
        createTaskRecord(updateTaskStatus(baseTask, testCase.inputs.status)),
      );
    }
  });
});
