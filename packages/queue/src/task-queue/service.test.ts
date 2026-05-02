import { describe, expect, it } from 'vitest';

import { TaskQueueService } from './service.js';

describe('TaskQueueService', () => {
  const cases = [
    {
      name: 'claims and updates tasks through the service shell',
      inputs: {
        task: {
          id: 'queue-001',
          summary: 'queue record',
          status: 'queued',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          taskId: 'task-1',
          sliceId: 'slice-1',
          threadId: 'thread-1',
        },
        assigneeId: 'worker-1',
      },
      mock: () => new TaskQueueService(),
      assert: (
        service: TaskQueueService,
        inputs: {
          task: Parameters<TaskQueueService['execute']>[0];
          assigneeId: string;
        },
      ) => {
        const task = service.execute(inputs.task);
        const claimed = service.claim(task, inputs.assigneeId);
        const running = service.updateStatus(claimed, 'running');

        expect(claimed.assigneeId).toBe('worker-1');
        expect(running.status).toBe('running');
        expect(service.explain(running)).toContain('task-1:running');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.assert(testCase.mock(), testCase.inputs);
  });
});
