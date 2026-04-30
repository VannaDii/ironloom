import type { LifecycleStatus } from '@vannadii/devplat-core';

export interface GateCheckResult {
  name: string;
  success: boolean;
  detail: string;
  failureKind?: 'command-failed' | 'timeout' | 'passed';
  nextAction?: string;
}

export interface GateFailureClassification {
  kind: 'passed' | 'retryable' | 'requires-remediation';
  failedGateNames: string[];
  nextAction: string;
}

export interface GateRunReport {
  id: string;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  passed: boolean;
  results: GateCheckResult[];
  classification?: GateFailureClassification;
  nextAction?: string;
}
