import * as t from 'io-ts';

import { LifecycleStatusCodec, type Exact } from '@vannadii/devplat-core';

import type { TaskRecord } from './types.js';

export const TaskTransitionEventCodec = t.intersection([
  t.type({
    toStatus: LifecycleStatusCodec,
    action: t.union([
      t.literal('create'),
      t.literal('claim'),
      t.literal('status-update'),
      t.literal('complete'),
      t.literal('block'),
    ]),
    reason: t.string,
    occurredAt: t.string,
  }),
  t.partial({
    fromStatus: LifecycleStatusCodec,
    actorId: t.string,
  }),
]);

export const TaskRecordCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    taskId: t.string,
    sliceId: t.string,
    threadId: t.string,
  }),
  t.partial({
    assigneeId: t.string,
    transitions: t.array(TaskTransitionEventCodec),
  }),
]);

export type _TaskRecordExact = Exact<
  TaskRecord,
  t.TypeOf<typeof TaskRecordCodec>
>;
