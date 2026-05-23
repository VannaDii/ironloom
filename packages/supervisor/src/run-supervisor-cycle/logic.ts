import {
  appendTrace,
  ARTIFACT_TYPE_GATE_RUN_REPORT,
  ARTIFACT_TYPE_PULL_REQUEST_RECORD,
  ARTIFACT_TYPE_REMEDIATION_PLAN,
  ARTIFACT_TYPE_RESEARCH_BRIEF,
  ARTIFACT_TYPE_SLICE_PLAN,
  ARTIFACT_TYPE_SPEC_RECORD,
  ARTIFACT_TYPE_TASK_RECORD,
  ARTIFACT_TYPE_WORKTREE_ALLOCATION,
  DEVPLAT_ACTION_RESEARCH,
  DEVPLAT_ACTION_SPEC,
} from '@vannadii/devplat-core';

import type { PolicyDecision } from '@vannadii/devplat-policy';

import type {
  SupervisorContinuationArtifactSignal,
  SupervisorContinuationDecision,
  SupervisorContinuationNextAction,
  SupervisorContinuationRequest,
  SupervisorDecision,
  SupervisorLifecycleSignal,
  SupervisorPhase,
  SupervisorRoutePlan,
} from './codec.js';
import {
  SUPERVISOR_CONTINUATION_ACTION_ALLOCATE_WORKTREE,
  SUPERVISOR_CONTINUATION_ACTION_CREATE_PULL_REQUEST_RECORD,
  SUPERVISOR_CONTINUATION_ACTION_CREATE_REMEDIATION_PLAN,
  SUPERVISOR_CONTINUATION_ACTION_CREATE_RESEARCH_BRIEF,
  SUPERVISOR_CONTINUATION_ACTION_CREATE_SLICE_PLAN,
  SUPERVISOR_CONTINUATION_ACTION_CREATE_SPEC_RECORD,
  SUPERVISOR_CONTINUATION_ACTION_CREATE_TASK_RECORD,
  SUPERVISOR_CONTINUATION_ACTION_PLAN_REBASE_DEPENDENTS,
  SUPERVISOR_CONTINUATION_ACTION_REQUEST_SPEC_APPROVAL,
  SUPERVISOR_CONTINUATION_ACTION_RUN_GATES,
  SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_MERGE,
  SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_UPDATE,
  SUPERVISOR_CONTINUATION_COMPLETE_STATUSES,
  SUPERVISOR_CONTINUATION_SPEC_APPROVAL_BLOCKER,
  SUPERVISOR_CONTINUATION_TOOL_ALLOCATE_WORKTREE,
  SUPERVISOR_CONTINUATION_TOOL_APPROVE_SPEC_RECORD,
  SUPERVISOR_CONTINUATION_TOOL_CREATE_PULL_REQUEST_RECORD,
  SUPERVISOR_CONTINUATION_TOOL_CREATE_REMEDIATION_PLAN,
  SUPERVISOR_CONTINUATION_TOOL_CREATE_RESEARCH_BRIEF,
  SUPERVISOR_CONTINUATION_TOOL_CREATE_SLICE_PLAN,
  SUPERVISOR_CONTINUATION_TOOL_CREATE_SPEC_RECORD,
  SUPERVISOR_CONTINUATION_TOOL_CREATE_TASK_RECORD,
  SUPERVISOR_CONTINUATION_TOOL_PLAN_REBASE_DEPENDENTS,
  SUPERVISOR_CONTINUATION_TOOL_RUN_GATES,
  SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_MERGE,
  SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_UPDATE,
  SUPERVISOR_CONTINUATION_TRACE_PREFIX,
  SUPERVISOR_PHASE_ACTION_KEYWORDS,
  SUPERVISOR_PHASE_ORDER,
  SUPERVISOR_ROUTE_TARGETS,
  SUPERVISOR_WORKTREE_ROUTE_TARGET,
} from './constants.js';

/**
 * Returns unique non-empty values after trimming operator or artifact input.
 */
function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Normalizes one artifact signal before continuation routing.
 */
function normalizeContinuationArtifact(
  artifact: SupervisorContinuationArtifactSignal,
): SupervisorContinuationArtifactSignal {
  return {
    artifactId: artifact.artifactId.trim(),
    artifactType: artifact.artifactType,
    status: artifact.status,
    updatedAt: new Date(artifact.updatedAt).toISOString(),
    ...(artifact.nextAction === undefined
      ? {}
      : { nextAction: artifact.nextAction.trim() }),
  };
}

/**
 * Normalizes a headless continuation request.
 */
function normalizeContinuationRequest(
  request: SupervisorContinuationRequest,
): SupervisorContinuationRequest {
  return {
    requestId: request.requestId.trim(),
    repositoryKey: request.repositoryKey,
    objective: request.objective.trim(),
    actorId: request.actorId.trim(),
    updatedAt: new Date(request.updatedAt).toISOString(),
    artifacts: request.artifacts.map(normalizeContinuationArtifact),
  };
}

/**
 * Finds the first artifact of the requested type.
 */
function findContinuationArtifact(
  artifacts: readonly SupervisorContinuationArtifactSignal[],
  artifactType: SupervisorContinuationArtifactSignal['artifactType'],
): SupervisorContinuationArtifactSignal | undefined {
  return artifacts.find((artifact) => artifact.artifactType === artifactType);
}

/**
 * Returns true when an artifact has a successful lifecycle status.
 */
function isCompleteContinuationArtifact(
  artifact: SupervisorContinuationArtifactSignal | undefined,
): boolean {
  return (
    artifact !== undefined &&
    SUPERVISOR_CONTINUATION_COMPLETE_STATUSES.has(artifact.status)
  );
}

/**
 * Creates a normalized continuation next-action payload.
 */
function createContinuationNextAction(
  input: SupervisorContinuationNextAction,
): SupervisorContinuationNextAction {
  return {
    ...input,
    summary: input.summary.trim(),
    reason: input.reason.trim(),
    artifactIds: uniqueTrimmed(input.artifactIds),
    missingArtifactTypes: [...new Set(input.missingArtifactTypes)],
    inputRequirements: uniqueTrimmed(input.inputRequirements),
  };
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
    case actionContainsPhaseKeyword(normalizedAction, DEVPLAT_ACTION_RESEARCH):
      return DEVPLAT_ACTION_RESEARCH;
    case actionContainsPhaseKeyword(normalizedAction, DEVPLAT_ACTION_SPEC):
      return DEVPLAT_ACTION_SPEC;
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

/** Creates supervisor route plan. */
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

/**
 * Builds the next action for the earliest incomplete lifecycle phase.
 */
function planContinuationNextAction(
  artifacts: readonly SupervisorContinuationArtifactSignal[],
): SupervisorContinuationNextAction {
  const artifactIds = uniqueTrimmed(
    artifacts.map((artifact) => artifact.artifactId),
  );
  const research = findContinuationArtifact(
    artifacts,
    ARTIFACT_TYPE_RESEARCH_BRIEF,
  );
  if (!isCompleteContinuationArtifact(research)) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_CREATE_RESEARCH_BRIEF,
      phase: DEVPLAT_ACTION_RESEARCH,
      routedTo: SUPERVISOR_ROUTE_TARGETS.research,
      toolName: SUPERVISOR_CONTINUATION_TOOL_CREATE_RESEARCH_BRIEF,
      summary: 'Create a research brief.',
      reason: 'No completed research brief exists for this objective.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_RESEARCH_BRIEF],
      inputRequirements: ['Topic', 'question', 'constraints', 'sources'],
    });
  }

  const spec = findContinuationArtifact(artifacts, ARTIFACT_TYPE_SPEC_RECORD);
  if (spec === undefined) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_CREATE_SPEC_RECORD,
      phase: DEVPLAT_ACTION_SPEC,
      routedTo: SUPERVISOR_ROUTE_TARGETS.spec,
      toolName: SUPERVISOR_CONTINUATION_TOOL_CREATE_SPEC_RECORD,
      summary: 'Create a spec record.',
      reason: 'Research exists without a spec record.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_SPEC_RECORD],
      inputRequirements: ['Research brief', 'objective', 'acceptance criteria'],
    });
  }

  if (spec.status !== 'approved') {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_REQUEST_SPEC_APPROVAL,
      phase: DEVPLAT_ACTION_SPEC,
      routedTo: SUPERVISOR_ROUTE_TARGETS.spec,
      toolName: SUPERVISOR_CONTINUATION_TOOL_APPROVE_SPEC_RECORD,
      summary: 'Request spec approval.',
      reason: 'A spec record exists but is not approved.',
      requiresHumanApproval: true,
      artifactIds,
      missingArtifactTypes: [],
      inputRequirements: ['Human-approved spec record'],
    });
  }

  const slice = findContinuationArtifact(artifacts, ARTIFACT_TYPE_SLICE_PLAN);
  if (!isCompleteContinuationArtifact(slice)) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_CREATE_SLICE_PLAN,
      phase: 'slicing',
      routedTo: SUPERVISOR_ROUTE_TARGETS.slicing,
      toolName: SUPERVISOR_CONTINUATION_TOOL_CREATE_SLICE_PLAN,
      summary: 'Create an implementation slice plan.',
      reason: 'Approved spec exists without a slice plan.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_SLICE_PLAN],
      inputRequirements: [
        'Approved spec record',
        'PR-sized implementation boundary',
      ],
    });
  }

  const task = findContinuationArtifact(artifacts, ARTIFACT_TYPE_TASK_RECORD);
  if (task === undefined) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_CREATE_TASK_RECORD,
      phase: 'implementation',
      routedTo: SUPERVISOR_ROUTE_TARGETS.implementation,
      toolName: SUPERVISOR_CONTINUATION_TOOL_CREATE_TASK_RECORD,
      summary: 'Create a task record.',
      reason: 'A slice plan exists without an implementation task.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_TASK_RECORD],
      inputRequirements: ['Slice plan', 'task summary', 'implementation owner'],
    });
  }

  const worktree = findContinuationArtifact(
    artifacts,
    ARTIFACT_TYPE_WORKTREE_ALLOCATION,
  );
  if (worktree === undefined) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_ALLOCATE_WORKTREE,
      phase: 'implementation',
      routedTo: SUPERVISOR_WORKTREE_ROUTE_TARGET,
      toolName: SUPERVISOR_CONTINUATION_TOOL_ALLOCATE_WORKTREE,
      summary: 'Allocate a worktree.',
      reason: 'A task exists without a worktree allocation.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_WORKTREE_ALLOCATION],
      inputRequirements: ['Task record', 'branch name', 'base branch'],
    });
  }

  const gate = findContinuationArtifact(
    artifacts,
    ARTIFACT_TYPE_GATE_RUN_REPORT,
  );
  if (gate === undefined) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_RUN_GATES,
      phase: 'gates',
      routedTo: SUPERVISOR_ROUTE_TARGETS.gates,
      toolName: SUPERVISOR_CONTINUATION_TOOL_RUN_GATES,
      summary: 'Run quality gates.',
      reason: 'A worktree exists without a gate run report.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_GATE_RUN_REPORT],
      inputRequirements: ['Gate names', 'worktree or repository cwd'],
    });
  }

  const remediation = findContinuationArtifact(
    artifacts,
    ARTIFACT_TYPE_REMEDIATION_PLAN,
  );
  if (gate.status === 'failed' && remediation === undefined) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_CREATE_REMEDIATION_PLAN,
      phase: 'remediation',
      routedTo: SUPERVISOR_ROUTE_TARGETS.remediation,
      toolName: SUPERVISOR_CONTINUATION_TOOL_CREATE_REMEDIATION_PLAN,
      summary: 'Create a remediation plan.',
      reason: 'A failed gate run needs remediation before PR projection.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_REMEDIATION_PLAN],
      inputRequirements: ['Failed gate report', 'review findings'],
    });
  }

  const pullRequest = findContinuationArtifact(
    artifacts,
    ARTIFACT_TYPE_PULL_REQUEST_RECORD,
  );
  if (pullRequest === undefined) {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_CREATE_PULL_REQUEST_RECORD,
      phase: 'merge',
      routedTo: SUPERVISOR_ROUTE_TARGETS.merge,
      toolName: SUPERVISOR_CONTINUATION_TOOL_CREATE_PULL_REQUEST_RECORD,
      summary: 'Create a pull request record.',
      reason: 'Validated implementation has no pull request projection.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [ARTIFACT_TYPE_PULL_REQUEST_RECORD],
      inputRequirements: ['Branch name', 'base branch', 'PR title'],
    });
  }

  if (pullRequest.status === 'merge-ready') {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_MERGE,
      phase: 'merge',
      routedTo: SUPERVISOR_ROUTE_TARGETS.merge,
      toolName: SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_MERGE,
      summary: 'Submit pull request merge.',
      reason: 'The pull request record is merge-ready.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [],
      inputRequirements: ['Merge-ready pull request record'],
    });
  }

  if (pullRequest.status === 'merged') {
    return createContinuationNextAction({
      kind: SUPERVISOR_CONTINUATION_ACTION_PLAN_REBASE_DEPENDENTS,
      phase: 'continuation',
      routedTo: SUPERVISOR_ROUTE_TARGETS.continuation,
      toolName: SUPERVISOR_CONTINUATION_TOOL_PLAN_REBASE_DEPENDENTS,
      summary: 'Plan dependent rebases.',
      reason: 'Merged work may unblock dependent branches.',
      requiresHumanApproval: false,
      artifactIds,
      missingArtifactTypes: [],
      inputRequirements: ['Dependent branch graph'],
    });
  }

  return createContinuationNextAction({
    kind: SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_UPDATE,
    phase: 'merge',
    routedTo: SUPERVISOR_ROUTE_TARGETS.merge,
    toolName: SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_UPDATE,
    summary: 'Submit pull request update.',
    reason: 'The pull request record is not merge-ready yet.',
    requiresHumanApproval: false,
    artifactIds,
    missingArtifactTypes: [],
    inputRequirements: ['Pull request record', 'validation summary'],
  });
}

/** Creates supervisor decision. */
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

/** Creates a headless continuation decision for software-building work. */
export function createSupervisorContinuation(
  input: SupervisorContinuationRequest,
): SupervisorContinuationDecision {
  const request = normalizeContinuationRequest(input);
  const nextAction = planContinuationNextAction(request.artifacts);
  const blockers = nextAction.requiresHumanApproval
    ? [SUPERVISOR_CONTINUATION_SPEC_APPROVAL_BLOCKER]
    : [];
  const decision: SupervisorContinuationDecision = {
    id: `continuation-${request.requestId}`,
    summary: `Continue ${request.repositoryKey}: ${nextAction.summary}`,
    status: nextAction.requiresHumanApproval ? 'review' : 'running',
    trace: [],
    updatedAt: request.updatedAt,
    requestId: request.requestId,
    repositoryKey: request.repositoryKey,
    objective: request.objective,
    actorId: request.actorId,
    nextAction,
    artifactIds: nextAction.artifactIds,
    blockers,
  };

  return appendTrace(
    decision,
    `${SUPERVISOR_CONTINUATION_TRACE_PREFIX}:${nextAction.toolName}`,
  );
}

/** Decide next state. */
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

/** Describes supervisor decision. */
export function describeSupervisorDecision(input: SupervisorDecision): string {
  return `${input.action} -> ${input.nextState}`;
}
