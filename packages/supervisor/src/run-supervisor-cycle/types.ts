import type * as t from 'io-ts';

import type { SupervisorDecisionCodec, SupervisorPhaseCodec } from './codec.js';

export type SupervisorPhase = t.TypeOf<typeof SupervisorPhaseCodec>;

export type SupervisorDecision = t.TypeOf<typeof SupervisorDecisionCodec>;
