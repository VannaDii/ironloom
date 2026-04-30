import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const PolicyPrivilegeLevelCodec = t.union([
  t.literal('automatic'),
  t.literal('human-approval'),
  t.literal('destructive'),
  t.literal('external-publish'),
]);

export const PolicyDecisionCodec = t.type({
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
});
