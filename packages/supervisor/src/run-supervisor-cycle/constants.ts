import type { SupervisorPhase } from './codec.js';

/**
 * Ordered supervisor lifecycle phases used to route ready work forward.
 */
export const SUPERVISOR_PHASE_ORDER = [
  'research',
  'spec',
  'slicing',
  'implementation',
  'gates',
  'review',
  'remediation',
  'merge',
  'continuation',
] satisfies readonly SupervisorPhase[];

/**
 * Runtime service owner for each supervisor lifecycle phase.
 */
export const SUPERVISOR_ROUTE_TARGETS = {
  research: 'research-brief-service',
  spec: 'spec-record-service',
  slicing: 'slice-plan-service',
  implementation: 'task-queue-service',
  gates: 'gate-run-service',
  review: 'review-findings-service',
  remediation: 'remediation-plan-service',
  merge: 'pull-request-service',
  continuation: 'branching-service',
} satisfies Readonly<Record<SupervisorPhase, string>>;

/**
 * Action keyword vocabulary used to infer a lifecycle phase.
 */
export const SUPERVISOR_PHASE_ACTION_KEYWORDS = {
  research: ['research'],
  spec: ['spec'],
  slicing: ['slice'],
  implementation: [],
  gates: ['gate'],
  review: ['review'],
  remediation: ['remediation', 'autofix'],
  merge: ['merge'],
  continuation: ['continue', 'rebase'],
} satisfies Readonly<Record<SupervisorPhase, readonly string[]>>;
