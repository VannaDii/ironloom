import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';
import {
  POLICY_ACTION_CATEGORY_AUTOFIX,
  POLICY_ACTION_CATEGORY_COMMAND_EXECUTION,
  POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP,
  POLICY_ACTION_CATEGORY_MERGE,
  POLICY_ACTION_CATEGORY_PUBLISH,
  POLICY_ACTION_CATEGORY_REBASE,
  POLICY_ACTION_CATEGORY_ROUTINE,
  POLICY_ACTION_CATEGORY_WORKTREE_RELEASE,
} from './constants.js';

export const PolicyPrivilegeLevelCodec = t.union([
  t.literal('automatic'),
  t.literal('human-approval'),
  t.literal('destructive'),
  t.literal('external-publish'),
]);

export const PolicyActionCategoryCodec = t.union([
  t.literal(POLICY_ACTION_CATEGORY_MERGE),
  t.literal(POLICY_ACTION_CATEGORY_COMMAND_EXECUTION),
  t.literal(POLICY_ACTION_CATEGORY_WORKTREE_RELEASE),
  t.literal(POLICY_ACTION_CATEGORY_REBASE),
  t.literal(POLICY_ACTION_CATEGORY_PUBLISH),
  t.literal(POLICY_ACTION_CATEGORY_AUTOFIX),
  t.literal(POLICY_ACTION_CATEGORY_DESTRUCTIVE_CLEANUP),
  t.literal(POLICY_ACTION_CATEGORY_ROUTINE),
]);

export const PolicyRiskLevelCodec = t.union([
  t.literal('low'),
  t.literal('medium'),
  t.literal('high'),
  t.literal('critical'),
]);

export const PolicyEscalationTargetCodec = t.union([
  t.literal('none'),
  t.literal('operator'),
  t.literal('maintainer'),
  t.literal('release-manager'),
]);

export const PolicyDecisionCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
    action: t.string,
    allowed: t.boolean,
    requiresApproval: t.boolean,
    auditRequired: t.boolean,
    privilegeLevel: PolicyPrivilegeLevelCodec,
    reason: t.string,
  }),
  t.partial({
    actionCategory: PolicyActionCategoryCodec,
    riskLevel: PolicyRiskLevelCodec,
    escalationRequired: t.boolean,
    escalationTarget: PolicyEscalationTargetCodec,
    nextAction: t.string,
    auditReason: t.string,
  }),
]);

export const PolicyActionEvaluationCodec = t.type({
  id: t.string,
  action: t.string,
  actionCategory: PolicyActionCategoryCodec,
  privileged: t.boolean,
  allowed: t.boolean,
  requiresApproval: t.boolean,
  auditRequired: t.boolean,
  privilegeLevel: PolicyPrivilegeLevelCodec,
  riskLevel: PolicyRiskLevelCodec,
  escalationRequired: t.boolean,
  escalationTarget: PolicyEscalationTargetCodec,
  reason: t.string,
  auditReason: t.string,
  nextAction: t.string,
  updatedAt: IsoTimestampCodec,
});

/** Privilege required by a policy-controlled action. */
export type PolicyPrivilegeLevel = t.TypeOf<typeof PolicyPrivilegeLevelCodec>;

/** Lifecycle category evaluated by policy. */
export type PolicyActionCategory = t.TypeOf<typeof PolicyActionCategoryCodec>;

/** Risk level assigned to a policy-controlled action. */
export type PolicyRiskLevel = t.TypeOf<typeof PolicyRiskLevelCodec>;

/** Human escalation target for a denied or risky action. */
export type PolicyEscalationTarget = t.TypeOf<
  typeof PolicyEscalationTargetCodec
>;

/** Policy decision returned for a lifecycle action. */
export type PolicyDecision = t.TypeOf<typeof PolicyDecisionCodec>;

/** Fully normalized policy action evaluation. */
export type PolicyActionEvaluation = t.TypeOf<
  typeof PolicyActionEvaluationCodec
>;
