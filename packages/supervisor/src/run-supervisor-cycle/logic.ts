import { appendTrace } from '@vannadii/devplat-core';

import type { PolicyDecision } from '@vannadii/devplat-policy';

import type {
  SupervisorDecision,
  SupervisorLifecycleSignal,
  SupervisorPhase,
  SupervisorRoutePlan,
} from './codec.js';

const supervisorPhaseOrder = [
  'research',
  'spec',
  'slicing',
  'implementation',
  'gates',
  'review',
  'remediation',
  'merge',
  'continuation',
] satisfies SupervisorPhase[];

const routeTargets: Record<SupervisorPhase, string> = {
  research: 'research-brief-service',
  spec: 'spec-record-service',
  slicing: 'slice-plan-service',
  implementation: 'task-queue-service',
  gates: 'gate-run-service',
  review: 'review-findings-service',
  remediation: 'remediation-plan-service',
  merge: 'pull-request-service',
  continuation: 'branching-service',
};

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

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

function getNextPhase(currentPhase: SupervisorPhase): SupervisorPhase {
  const currentIndex = supervisorPhaseOrder.indexOf(currentPhase);
  const nextPhase = supervisorPhaseOrder[currentIndex + 1];

  return nextPhase ?? 'continuation';
}

function normalizeLifecycleSignal(
  signal: SupervisorLifecycleSignal,
): SupervisorLifecycleSignal {
  return {
    phase: signal.phase,
    ready: signal.ready,
    artifactIds: uniqueTrimmed(signal.artifactIds),
    blockers: uniqueTrimmed(signal.blockers),
    nextAction: signal.nextAction.trim(),
  };
}

function findLifecycleSignal(
  phase: SupervisorPhase,
  signals: readonly SupervisorLifecycleSignal[],
): SupervisorLifecycleSignal | undefined {
  return signals.find((signal) => signal.phase === phase);
}

export function createSupervisorRoutePlan(input: {
  action: string;
  approved: boolean;
  currentPhase: SupervisorPhase;
  lifecycleSignals: readonly SupervisorLifecycleSignal[];
}): SupervisorRoutePlan {
  const lifecycleSignals = input.lifecycleSignals.map(normalizeLifecycleSignal);
  const currentSignal = findLifecycleSignal(
    input.currentPhase,
    lifecycleSignals,
  );
  const action = input.action.trim();

  if (!input.approved) {
    return {
      currentPhase: input.currentPhase,
      nextPhase: input.currentPhase,
      routedTo: 'policy-service',
      nextAction: `await-approval:${action}`,
      status: 'blocked',
      blockers: uniqueTrimmed([
        ...(currentSignal?.blockers ?? []),
        'policy approval required',
      ]),
      artifactIds: uniqueTrimmed(currentSignal?.artifactIds ?? []),
      auditReason: `Policy blocked ${action} in ${input.currentPhase}`,
    };
  }

  if (currentSignal !== undefined && !currentSignal.ready) {
    return {
      currentPhase: input.currentPhase,
      nextPhase: input.currentPhase,
      routedTo: routeTargets[input.currentPhase],
      nextAction: currentSignal.nextAction,
      status: 'waiting',
      blockers: uniqueTrimmed(currentSignal.blockers),
      artifactIds: uniqueTrimmed(currentSignal.artifactIds),
      auditReason: `Waiting for ${input.currentPhase} blockers before routing forward`,
    };
  }

  const nextPhase = getNextPhase(input.currentPhase);
  return {
    currentPhase: input.currentPhase,
    nextPhase,
    routedTo: routeTargets[nextPhase],
    nextAction: `run-${nextPhase}`,
    status: 'ready',
    blockers: [],
    artifactIds: uniqueTrimmed(currentSignal?.artifactIds ?? []),
    auditReason: `Routed ${input.currentPhase} to ${nextPhase}`,
  };
}

export function createSupervisorDecision(
  input: SupervisorDecision,
): SupervisorDecision {
  const phase = input.phase ?? inferSupervisorPhase(input.action);
  const lifecycleSignals = (input.lifecycleSignals ?? []).map(
    normalizeLifecycleSignal,
  );
  const routePlan =
    input.routePlan ??
    createSupervisorRoutePlan({
      action: input.action,
      approved: input.approved,
      currentPhase: phase,
      lifecycleSignals,
    });

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
      phase,
      routedTo: input.routedTo ?? routePlan.routedTo,
      routePlan,
      lifecycleSignals,
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
