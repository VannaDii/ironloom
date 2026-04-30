import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const SupervisorPhaseCodec = t.union([
  t.literal('research'),
  t.literal('spec'),
  t.literal('slicing'),
  t.literal('implementation'),
  t.literal('gates'),
  t.literal('review'),
  t.literal('remediation'),
  t.literal('merge'),
  t.literal('continuation'),
]);

export const SupervisorDecisionCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    action: t.string,
    nextState: LifecycleStatusCodec,
    approved: t.boolean,
    notes: t.array(t.string),
  }),
  t.partial({
    phase: SupervisorPhaseCodec,
    routedTo: t.string,
  }),
]);
