import {
  claimTask,
  createTaskRecord,
  describeTaskRecord,
  updateTaskStatus,
} from './logic.js';
import type { TaskRecord } from './codec.js';

export class TaskQueueService {
  public execute(input: TaskRecord): TaskRecord {
    return createTaskRecord(input);
  }

  public explain(input: TaskRecord): string {
    return describeTaskRecord(input);
  }

  public claim(input: TaskRecord, assigneeId: string): TaskRecord {
    return claimTask(input, assigneeId);
  }

  public updateStatus(
    input: TaskRecord,
    status: TaskRecord['status'],
  ): TaskRecord {
    return updateTaskStatus(input, status);
  }
}
