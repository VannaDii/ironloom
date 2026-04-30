import type { LifecycleStatus } from '@vannadii/devplat-core';

export type TaskTransitionAction =
  | 'create'
  | 'claim'
  | 'status-update'
  | 'complete'
  | 'block';

export interface TaskTransitionEvent {
  fromStatus?: LifecycleStatus;
  toStatus: LifecycleStatus;
  action: TaskTransitionAction;
  actorId?: string;
  reason: string;
  occurredAt: string;
}

export interface TaskRecord {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  taskId: string;
  sliceId: string;
  threadId: string;
  assigneeId?: string;
  transitions?: TaskTransitionEvent[];
}
