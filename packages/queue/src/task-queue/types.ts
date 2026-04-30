import type * as t from 'io-ts';

import type { TaskRecordCodec, TaskTransitionEventCodec } from './codec.js';

export type TaskTransitionEvent = t.TypeOf<typeof TaskTransitionEventCodec>;

export type TaskTransitionAction = TaskTransitionEvent['action'];

export type TaskRecord = t.TypeOf<typeof TaskRecordCodec>;
