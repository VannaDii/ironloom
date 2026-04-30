import type { LifecycleStatus } from '@vannadii/devplat-core';

export interface PolicyDecision {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  action: string;
  allowed: boolean;
  requiresApproval: boolean;
  auditRequired: boolean;
  privilegeLevel:
    | 'automatic'
    | 'human-approval'
    | 'destructive'
    | 'external-publish';
  reason: string;
}
