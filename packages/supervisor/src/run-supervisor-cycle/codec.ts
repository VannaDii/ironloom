import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

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
    updatedAt: IsoTimestampCodec,
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

/** Supervisor lifecycle phase. */
export type SupervisorPhase = t.TypeOf<typeof SupervisorPhaseCodec>;

/** Routing status for the next supervisor step. */
export type SupervisorRouteStatus = t.TypeOf<typeof SupervisorRouteStatusCodec>;

/** Signal emitted by a lifecycle package for supervisor routing. */
export type SupervisorLifecycleSignal = t.TypeOf<
  typeof SupervisorLifecycleSignalCodec
>;

/** Supervisor route plan for the next lifecycle step. */
export type SupervisorRoutePlan = t.TypeOf<typeof SupervisorRoutePlanCodec>;

/** Durable supervisor decision. */
export type SupervisorDecision = t.TypeOf<typeof SupervisorDecisionCodec>;
