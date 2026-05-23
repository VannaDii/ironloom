import * as t from 'io-ts';

import {
  DEVPLAT_ACTION_RESEARCH,
  DEVPLAT_ACTION_SPEC,
  IsoTimestampCodec,
  LifecycleStatusCodec,
  RepositoryKeyCodec,
  SupportedArtifactTypeCodec,
} from '@vannadii/devplat-core';

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
} from './constants.js';

/** Codec for supervisor phase. */
export const SupervisorPhaseCodec = t.union([
  t.literal(DEVPLAT_ACTION_RESEARCH),
  t.literal(DEVPLAT_ACTION_SPEC),
  t.literal('slicing'),
  t.literal('implementation'),
  t.literal('gates'),
  t.literal('review'),
  t.literal('remediation'),
  t.literal('merge'),
  t.literal('continuation'),
]);

/** Codec for supervisor route status. */
export const SupervisorRouteStatusCodec = t.union([
  t.literal('ready'),
  t.literal('waiting'),
  t.literal('blocked'),
]);

/** Codec for supervisor lifecycle signal. */
export const SupervisorLifecycleSignalCodec = t.type({
  phase: SupervisorPhaseCodec,
  ready: t.boolean,
  artifactIds: t.array(t.string),
  blockers: t.array(t.string),
  nextAction: t.string,
});

/** Codec for headless continuation action kinds. */
export const SupervisorContinuationActionKindCodec = t.union([
  t.literal(SUPERVISOR_CONTINUATION_ACTION_CREATE_RESEARCH_BRIEF),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_CREATE_SPEC_RECORD),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_REQUEST_SPEC_APPROVAL),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_CREATE_SLICE_PLAN),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_CREATE_TASK_RECORD),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_ALLOCATE_WORKTREE),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_RUN_GATES),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_CREATE_REMEDIATION_PLAN),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_CREATE_PULL_REQUEST_RECORD),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_UPDATE),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_MERGE),
  t.literal(SUPERVISOR_CONTINUATION_ACTION_PLAN_REBASE_DEPENDENTS),
]);

/** Codec for platform tool names returned by headless continuation. */
export const SupervisorContinuationToolNameCodec = t.union([
  t.literal(SUPERVISOR_CONTINUATION_TOOL_CREATE_RESEARCH_BRIEF),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_CREATE_SPEC_RECORD),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_APPROVE_SPEC_RECORD),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_CREATE_SLICE_PLAN),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_CREATE_TASK_RECORD),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_ALLOCATE_WORKTREE),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_RUN_GATES),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_CREATE_REMEDIATION_PLAN),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_CREATE_PULL_REQUEST_RECORD),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_UPDATE),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_MERGE),
  t.literal(SUPERVISOR_CONTINUATION_TOOL_PLAN_REBASE_DEPENDENTS),
]);

/** Codec for an artifact summary used by headless continuation routing. */
export const SupervisorContinuationArtifactSignalCodec = t.intersection([
  t.type({
    artifactId: t.string,
    artifactType: SupportedArtifactTypeCodec,
    status: LifecycleStatusCodec,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    nextAction: t.string,
  }),
]);

/** Codec for a headless continuation request. */
export const SupervisorContinuationRequestCodec = t.type({
  requestId: t.string,
  repositoryKey: RepositoryKeyCodec,
  objective: t.string,
  actorId: t.string,
  updatedAt: IsoTimestampCodec,
  artifacts: t.array(SupervisorContinuationArtifactSignalCodec),
});

/** Codec for the next action returned by headless continuation. */
export const SupervisorContinuationNextActionCodec = t.type({
  kind: SupervisorContinuationActionKindCodec,
  phase: SupervisorPhaseCodec,
  routedTo: t.string,
  toolName: SupervisorContinuationToolNameCodec,
  summary: t.string,
  reason: t.string,
  requiresHumanApproval: t.boolean,
  artifactIds: t.array(t.string),
  missingArtifactTypes: t.array(SupportedArtifactTypeCodec),
  inputRequirements: t.array(t.string),
});

/** Codec for a headless continuation decision. */
export const SupervisorContinuationDecisionCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  requestId: t.string,
  repositoryKey: RepositoryKeyCodec,
  objective: t.string,
  actorId: t.string,
  nextAction: SupervisorContinuationNextActionCodec,
  artifactIds: t.array(t.string),
  blockers: t.array(t.string),
});

/** Codec for supervisor route plan. */
export const SupervisorRoutePlanCodec = t.type({
  currentPhase: SupervisorPhaseCodec,
  nextPhase: SupervisorPhaseCodec,
  routedTo: t.string,
  nextAction: t.string,
  status: SupervisorRouteStatusCodec,
  blockers: t.array(t.string),
  artifactIds: t.array(t.string),
  auditReason: t.string,
});

/** Codec for supervisor decision. */
export const SupervisorDecisionCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
    action: t.string,
    nextState: LifecycleStatusCodec,
    approved: t.boolean,
    notes: t.array(t.string),
  }),
  t.partial({
    phase: SupervisorPhaseCodec,
    routedTo: t.string,
    routePlan: SupervisorRoutePlanCodec,
    lifecycleSignals: t.array(SupervisorLifecycleSignalCodec),
  }),
]);

/** Supervisor lifecycle phase. */
export type SupervisorPhase = t.TypeOf<typeof SupervisorPhaseCodec>;

/** Routing status for the next supervisor step. */
export type SupervisorRouteStatus = t.TypeOf<typeof SupervisorRouteStatusCodec>;

/** Signal emitted by a lifecycle package for supervisor routing. */
export type SupervisorLifecycleSignal = t.TypeOf<
  typeof SupervisorLifecycleSignalCodec
>;

/** Headless continuation action kind. */
export type SupervisorContinuationActionKind = t.TypeOf<
  typeof SupervisorContinuationActionKindCodec
>;

/** Platform tool name returned by headless continuation. */
export type SupervisorContinuationToolName = t.TypeOf<
  typeof SupervisorContinuationToolNameCodec
>;

/** Artifact summary used by headless continuation routing. */
export type SupervisorContinuationArtifactSignal = t.TypeOf<
  typeof SupervisorContinuationArtifactSignalCodec
>;

/** Request to continue a headless software-building lifecycle. */
export type SupervisorContinuationRequest = t.TypeOf<
  typeof SupervisorContinuationRequestCodec
>;

/** Next action returned by headless continuation routing. */
export type SupervisorContinuationNextAction = t.TypeOf<
  typeof SupervisorContinuationNextActionCodec
>;

/** Headless continuation decision. */
export type SupervisorContinuationDecision = t.TypeOf<
  typeof SupervisorContinuationDecisionCodec
>;

/** Supervisor route plan for the next lifecycle step. */
export type SupervisorRoutePlan = t.TypeOf<typeof SupervisorRoutePlanCodec>;

/** Durable supervisor decision. */
export type SupervisorDecision = t.TypeOf<typeof SupervisorDecisionCodec>;
