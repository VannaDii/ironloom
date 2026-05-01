import type * as t from 'io-ts';

import type {
  PolicyActionCategoryCodec,
  PolicyActionEvaluationCodec,
  PolicyDecisionCodec,
  PolicyEscalationTargetCodec,
  PolicyPrivilegeLevelCodec,
  PolicyRiskLevelCodec,
} from './codec.js';

export type PolicyPrivilegeLevel = t.TypeOf<typeof PolicyPrivilegeLevelCodec>;

export type PolicyActionCategory = t.TypeOf<typeof PolicyActionCategoryCodec>;

export type PolicyRiskLevel = t.TypeOf<typeof PolicyRiskLevelCodec>;

export type PolicyEscalationTarget = t.TypeOf<
  typeof PolicyEscalationTargetCodec
>;

export type PolicyDecision = t.TypeOf<typeof PolicyDecisionCodec>;

export type PolicyActionEvaluation = t.TypeOf<
  typeof PolicyActionEvaluationCodec
>;
