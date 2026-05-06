import {
  claimTask,
  createTaskRecord,
  describeTaskRecord,
  updateTaskStatus,
} from './logic.js';
import type { TaskRecord } from './codec.js';

/** Task queue service. */
export class TaskQueueService {
  /** Executes the service operation. */
  public execute(input: TaskRecord): TaskRecord {
    return createTaskRecord(input);
  }

  /** Describes the service result for operators. */
  public explain(input: TaskRecord): string {
    return describeTaskRecord(input);
  }

  /** Claim. */
  public claim(input: TaskRecord, assigneeId: string): TaskRecord {
    return claimTask(input, assigneeId);
  }

  /** Update status. */
  public updateStatus(
    input: TaskRecord,
    status: TaskRecord['status'],
  ): TaskRecord {
    return updateTaskStatus(input, status);
  }
}
