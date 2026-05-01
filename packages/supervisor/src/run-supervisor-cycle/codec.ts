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

export const SupervisorRouteStatusCodec = t.union([
  t.literal('ready'),
  t.literal('waiting'),
  t.literal('blocked'),
]);

export const SupervisorLifecycleSignalCodec = t.type({
  phase: SupervisorPhaseCodec,
  ready: t.boolean,
  artifactIds: t.array(t.string),
  blockers: t.array(t.string),
  nextAction: t.string,
});

export const SupervisorRoutePlanCodec = t.type({
  currentPhase: SupervisorPhaseCodec,
  nextPhase: SupervisorPhaseCodec,
  routedTo: t.string,
  nextAction: t.string,
  status: SupervisorRouteStatusCodec,
  blockers: t.array(t.string),
  artifactIds: t.array(t.string),
  auditReason: t.string,
});

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
    routePlan: SupervisorRoutePlanCodec,
    lifecycleSignals: t.array(SupervisorLifecycleSignalCodec),
  }),
]);
