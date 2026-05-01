import type * as t from 'io-ts';

import type {
  SupervisorDecisionCodec,
  SupervisorLifecycleSignalCodec,
  SupervisorPhaseCodec,
  SupervisorRoutePlanCodec,
  SupervisorRouteStatusCodec,
} from './codec.js';

export type SupervisorPhase = t.TypeOf<typeof SupervisorPhaseCodec>;

export type SupervisorRouteStatus = t.TypeOf<typeof SupervisorRouteStatusCodec>;

export type SupervisorLifecycleSignal = t.TypeOf<
  typeof SupervisorLifecycleSignalCodec
>;

export type SupervisorRoutePlan = t.TypeOf<typeof SupervisorRoutePlanCodec>;

export type SupervisorDecision = t.TypeOf<typeof SupervisorDecisionCodec>;
