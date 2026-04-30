import * as t from 'io-ts';

import { LifecycleStatusCodec, type Exact } from '@vannadii/devplat-core';

import type { PolicyDecision } from './types.js';

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
  privilegeLevel: t.union([
    t.literal('automatic'),
    t.literal('human-approval'),
    t.literal('destructive'),
    t.literal('external-publish'),
  ]),
  reason: t.string,
});

export type _PolicyDecisionExact = Exact<
  PolicyDecision,
  t.TypeOf<typeof PolicyDecisionCodec>
>;
