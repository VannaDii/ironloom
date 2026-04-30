import { appendTrace } from '@vannadii/devplat-core';

import type { PolicyDecision } from '@vannadii/devplat-policy';

import type { SupervisorDecision, SupervisorPhase } from './types.js';

export function inferSupervisorPhase(action: string): SupervisorPhase {
  if (action.includes('research')) {
    return 'research';
  }
  if (action.includes('spec')) {
    return 'spec';
  }
  if (action.includes('slice')) {
    return 'slicing';
  }
  if (action.includes('gate')) {
    return 'gates';
  }
  if (action.includes('review')) {
    return 'review';
  }
  if (action.includes('remediation') || action.includes('autofix')) {
    return 'remediation';
  }
  if (action.includes('merge')) {
    return 'merge';
  }
  if (action.includes('continue') || action.includes('rebase')) {
    return 'continuation';
  }
  return 'implementation';
}

export function createSupervisorDecision(
  input: SupervisorDecision,
): SupervisorDecision {
  const phase = input.phase ?? inferSupervisorPhase(input.action);
  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
      phase,
      routedTo: input.routedTo ?? phase,
    },
    `supervisor:${input.action}:${input.nextState}`,
  );
}

export function decideNextState(
  policyDecision: PolicyDecision,
): SupervisorDecision {
  return createSupervisorDecision({
    id: `supervisor-${policyDecision.action}`,
    summary: `Supervisor handled ${policyDecision.action}`,
    status: policyDecision.allowed ? 'approved' : 'review',
    trace: [],
    updatedAt: new Date().toISOString(),
    action: policyDecision.action,
    nextState: policyDecision.allowed ? 'approved' : 'review',
    approved: policyDecision.allowed,
    notes: [policyDecision.reason],
  });
}

export function describeSupervisorDecision(input: SupervisorDecision): string {
  return `${input.action} -> ${input.nextState}`;
}
