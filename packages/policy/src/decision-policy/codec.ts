import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const PolicyPrivilegeLevelCodec = t.union([
  t.literal('automatic'),
  t.literal('human-approval'),
  t.literal('destructive'),
  t.literal('external-publish'),
]);

export const PolicyActionCategoryCodec = t.union([
  t.literal('merge'),
  t.literal('command-execution'),
  t.literal('worktree-release'),
  t.literal('rebase'),
  t.literal('publish'),
  t.literal('autofix'),
  t.literal('destructive-cleanup'),
  t.literal('routine'),
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
    updatedAt: t.string,
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
  updatedAt: t.string,
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
