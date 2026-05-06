import { appendTrace, type LifecycleStatus } from '@vannadii/devplat-core';

import type {
  TaskRecord,
  TaskTransitionAction,
  TaskTransitionEvent,
} from './codec.js';

/** Creates task transition event. */
export function createTaskTransitionEvent(
  input: TaskTransitionEvent,
): TaskTransitionEvent {
  return {
    ...input,
    reason: input.reason.trim(),
    occurredAt: new Date(input.occurredAt).toISOString(),
  };
}

/** Infer task transition action. */
function inferTaskTransitionAction(
  status: LifecycleStatus,
): TaskTransitionAction {
  if (status === 'complete') {
    return 'complete';
  }
  if (status === 'blocked' || status === 'failed') {
    return 'block';
  }
  return 'status-update';
}

/** Normalizes task transitions. */
function normalizeTaskTransitions(
  transitions: readonly TaskTransitionEvent[] | undefined,
): TaskTransitionEvent[] {
  return transitions?.map(createTaskTransitionEvent) ?? [];
}

/** Creates task record. */
export function createTaskRecord(input: TaskRecord): TaskRecord {
  const transitions = normalizeTaskTransitions(input.transitions);
  const created =
    transitions.length === 0
      ? [
          createTaskTransitionEvent({
            toStatus: input.status,
            action: 'create',
            reason: `Created task ${input.taskId}`,
            occurredAt: input.updatedAt,
          }),
        ]
      : transitions;
  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
      transitions: created,
    },
    `queue:${input.taskId}:${input.status}`,
  );
}

/** Claim task. */
export function claimTask(record: TaskRecord, assigneeId: string): TaskRecord {
  return createTaskRecord({
    ...record,
    status: 'claimed',
    assigneeId,
    transitions: [
      ...(record.transitions ?? []),
      createTaskTransitionEvent({
        fromStatus: record.status,
        toStatus: 'claimed',
        action: 'claim',
        actorId: assigneeId,
        reason: `Claimed task ${record.taskId}`,
        occurredAt: record.updatedAt,
      }),
    ],
  });
}

/** Release task. */
export function releaseTask(record: TaskRecord, reason: string): TaskRecord {
  const recordWithoutAssignee = { ...record };
  delete recordWithoutAssignee.assigneeId;

  return createTaskRecord({
    ...recordWithoutAssignee,
    status: 'queued',
    transitions: [
      ...(record.transitions ?? []),
      createTaskTransitionEvent({
        fromStatus: record.status,
        toStatus: 'queued',
        action: 'release',
        reason,
        occurredAt: record.updatedAt,
      }),
    ],
  });
}

/** Resume task. */
export function resumeTask(record: TaskRecord, actorId: string): TaskRecord {
  return createTaskRecord({
    ...record,
    status: 'running',
    transitions: [
      ...(record.transitions ?? []),
      createTaskTransitionEvent({
        fromStatus: record.status,
        toStatus: 'running',
        action: 'resume',
        actorId,
        reason: `Resumed task ${record.taskId}`,
        occurredAt: record.updatedAt,
      }),
    ],
  });
}

/** Update task status. */
export function updateTaskStatus(
  record: TaskRecord,
  status: LifecycleStatus,
): TaskRecord {
  return createTaskRecord({
    ...record,
    status,
    transitions: [
      ...(record.transitions ?? []),
      createTaskTransitionEvent({
        fromStatus: record.status,
        toStatus: status,
        action: inferTaskTransitionAction(status),
        reason: `Moved task ${record.taskId} to ${status}`,
        occurredAt: record.updatedAt,
      }),
    ],
  });
}

/** Describes task record. */
export function describeTaskRecord(input: TaskRecord): string {
  return `${input.taskId}:${input.status} -> ${input.summary}`;
}
