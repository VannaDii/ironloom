import type * as t from 'io-ts';

import type {
  PolicyDecisionCodec,
  PolicyPrivilegeLevelCodec,
} from './codec.js';

export type PolicyPrivilegeLevel = t.TypeOf<typeof PolicyPrivilegeLevelCodec>;

export type PolicyDecision = t.TypeOf<typeof PolicyDecisionCodec>;
