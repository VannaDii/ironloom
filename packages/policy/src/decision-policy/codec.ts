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
