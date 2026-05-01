import { describe, expect, it } from 'vitest';

import {
  claimTask,
  createTaskTransitionEvent,
  createTaskRecord,
  describeTaskRecord,
  releaseTask,
  resumeTask,
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
  const cases = [
    {
      name: 'claims a queued task',
      inputs: {
        record: baseTask,
        assigneeId: 'worker-1',
      },
      mock: () => undefined,
      assert: (inputs: { record: TaskRecord; assigneeId: string }) => {
        const record = claimTask(
          createTaskRecord(inputs.record),
          inputs.assigneeId,
        );

        expect(record.status).toBe('claimed');
        expect(record.assigneeId).toBe('worker-1');
      },
    },
    {
      name: 'updates lifecycle status with trace markers',
      inputs: {
        record: baseTask,
        status: 'running',
      },
      mock: () => undefined,
      assert: (inputs: {
        record: TaskRecord;
        status: Parameters<typeof updateTaskStatus>[1];
      }) => {
        const record = updateTaskStatus(
          createTaskRecord(inputs.record),
          inputs.status,
        );

        expect(record.trace).toContain('queue:task-1:running');
        expect(describeTaskRecord(record)).toContain('task-1:running');
      },
    },
    {
      name: 'records durable lifecycle transitions for claims and completion',
      inputs: {
        record: createTaskRecord(baseTask),
      },
      mock: () => undefined,
      assert: (inputs: { record: TaskRecord }) => {
        const claimed = claimTask(inputs.record, 'worker-2');
        const completed = updateTaskStatus(claimed, 'complete');

        expect(completed.transitions?.map((event) => event.action)).toEqual([
          'create',
          'claim',
          'complete',
        ]);
        expect(completed.transitions?.at(-1)?.reason).toBe(
          'Moved task task-1 to complete',
        );
      },
    },
    {
      name: 'normalizes task transition reasons',
      inputs: {
        transition: {
          toStatus: 'queued',
          action: 'create',
          reason: '  queued  ',
          occurredAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        transition: Parameters<typeof createTaskTransitionEvent>[0];
      }) => {
        expect(createTaskTransitionEvent(inputs.transition).reason).toBe(
          'queued',
        );
      },
    },
    {
      name: 'marks blocked status updates as block transitions',
      inputs: {
        status: 'blocked',
      },
      mock: () => undefined,
      assert: (inputs: { status: Parameters<typeof updateTaskStatus>[1] }) => {
        const record = createTaskRecord(
          updateTaskStatus(baseTask, inputs.status),
        );

        expect(record.transitions?.at(-1)?.action).toBe('block');
      },
    },
    {
      name: 'marks failed status updates as block transitions',
      inputs: {
        status: 'failed',
      },
      mock: () => undefined,
      assert: (inputs: { status: Parameters<typeof updateTaskStatus>[1] }) => {
        const record = createTaskRecord(
          updateTaskStatus(baseTask, inputs.status),
        );

        expect(record.transitions?.at(-1)?.action).toBe('block');
      },
    },
    {
      name: 'records release and resume transitions for durable queue history',
      inputs: {
        reason: '  operator reassigned  ',
        actorId: 'worker-3',
      },
      mock: () => undefined,
      assert: (inputs: { reason: string; actorId: string }) => {
        const claimed = claimTask(createTaskRecord(baseTask), 'worker-2');
        const released = releaseTask(claimed, inputs.reason);
        const resumed = resumeTask(released, inputs.actorId);

        expect(resumed.status).toBe('running');
        expect(resumed.transitions?.map((event) => event.action)).toEqual([
          'create',
          'claim',
          'release',
          'resume',
        ]);
        expect(resumed.transitions?.at(2)?.reason).toBe('operator reassigned');
      },
    },
    {
      name: 'records release transitions from uninitialized task history',
      inputs: {
        reason: '  no assignee  ',
      },
      mock: () => undefined,
      assert: (inputs: { reason: string }) => {
        const released = releaseTask(baseTask, inputs.reason);

        expect(released.assigneeId).toBeUndefined();
        expect(released.transitions?.map((event) => event.action)).toEqual([
          'release',
        ]);
      },
    },
    {
      name: 'records resume transitions from uninitialized task history',
      inputs: {
        actorId: 'worker-4',
      },
      mock: () => undefined,
      assert: (inputs: { actorId: string }) => {
        const resumed = resumeTask(baseTask, inputs.actorId);

        expect(resumed.status).toBe('running');
        expect(resumed.transitions?.map((event) => event.action)).toEqual([
          'resume',
        ]);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});
