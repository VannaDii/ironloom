import { appendTrace } from '@vannadii/devplat-core';

import type { PolicyDecision } from '@vannadii/devplat-policy';

import type {
  SupervisorDecision,
  SupervisorLifecycleSignal,
  SupervisorPhase,
  SupervisorRoutePlan,
} from './codec.js';
import {
  SUPERVISOR_PHASE_ACTION_KEYWORDS,
  SUPERVISOR_PHASE_ORDER,
  SUPERVISOR_ROUTE_TARGETS,
} from './constants.js';

/**
 * Returns unique non-empty values after trimming operator or artifact input.
 */
function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Checks whether an action contains any keyword registered for a phase.
 */
function actionContainsPhaseKeyword(
  action: string,
  phase: SupervisorPhase,
): boolean {
  return SUPERVISOR_PHASE_ACTION_KEYWORDS[phase].some((keyword) =>
    action.includes(keyword),
  );
}

/**
 * Infers the lifecycle phase implied by an operator or policy action.
 */
export function inferSupervisorPhase(action: string): SupervisorPhase {
  const normalizedAction = action.trim();

  switch (true) {
    case actionContainsPhaseKeyword(normalizedAction, 'research'):
      return 'research';
    case actionContainsPhaseKeyword(normalizedAction, 'spec'):
      return 'spec';
    case actionContainsPhaseKeyword(normalizedAction, 'slicing'):
      return 'slicing';
    case actionContainsPhaseKeyword(normalizedAction, 'gates'):
      return 'gates';
    case actionContainsPhaseKeyword(normalizedAction, 'review'):
      return 'review';
    case actionContainsPhaseKeyword(normalizedAction, 'remediation'):
      return 'remediation';
    case actionContainsPhaseKeyword(normalizedAction, 'merge'):
      return 'merge';
    case actionContainsPhaseKeyword(normalizedAction, 'continuation'):
      return 'continuation';
    default:
      return 'implementation';
  }
}

/**
 * Resolves the next lifecycle phase, keeping continuation terminal.
 */
function getNextPhase(currentPhase: SupervisorPhase): SupervisorPhase {
  const currentIndex = SUPERVISOR_PHASE_ORDER.indexOf(currentPhase);
  const nextPhase = SUPERVISOR_PHASE_ORDER[currentIndex + 1];

  return nextPhase ?? 'continuation';
}

/**
 * Normalizes a lifecycle signal before route planning.
 */
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

/**
 * Finds the current lifecycle signal for a phase.
 */
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
      routedTo: SUPERVISOR_ROUTE_TARGETS[input.currentPhase],
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
    routedTo: SUPERVISOR_ROUTE_TARGETS[nextPhase],
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
