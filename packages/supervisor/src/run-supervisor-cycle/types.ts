import type { LifecycleStatus } from '@vannadii/devplat-core';

export type SupervisorPhase =
  | 'research'
  | 'spec'
  | 'slicing'
  | 'implementation'
  | 'gates'
  | 'review'
  | 'remediation'
  | 'merge'
  | 'continuation';

export interface SupervisorDecision {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  action: string;
  nextState: LifecycleStatus;
  approved: boolean;
  notes: string[];
  phase?: SupervisorPhase;
  routedTo?: string;
}
