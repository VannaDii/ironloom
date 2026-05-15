import {
  DEVPLAT_ACTION_AUTOFIX,
  DEVPLAT_ACTION_RUN_GATES,
} from '@vannadii/devplat-core';

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
 * Runtime service owner for worktree allocation continuation actions.
 */
export const SUPERVISOR_WORKTREE_ROUTE_TARGET = 'worktree-allocation-service';

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
  remediation: ['remediation', DEVPLAT_ACTION_AUTOFIX],
  merge: ['merge'],
  continuation: ['continue', 'rebase'],
} satisfies Readonly<Record<SupervisorPhase, readonly string[]>>;

/**
 * Continuation action that asks the caller to create a research brief.
 */
export const SUPERVISOR_CONTINUATION_ACTION_CREATE_RESEARCH_BRIEF =
  'create-research-brief';

/**
 * Continuation action that asks the caller to create a spec record.
 */
export const SUPERVISOR_CONTINUATION_ACTION_CREATE_SPEC_RECORD =
  'create-spec-record';

/**
 * Continuation action that asks a human to approve a spec record.
 */
export const SUPERVISOR_CONTINUATION_ACTION_REQUEST_SPEC_APPROVAL =
  'request-spec-approval';

/**
 * Continuation action that asks the caller to create a slice plan.
 */
export const SUPERVISOR_CONTINUATION_ACTION_CREATE_SLICE_PLAN =
  'create-slice-plan';

/**
 * Continuation action that asks the caller to create a task record.
 */
export const SUPERVISOR_CONTINUATION_ACTION_CREATE_TASK_RECORD =
  'create-task-record';

/**
 * Continuation action that asks the caller to allocate a worktree.
 */
export const SUPERVISOR_CONTINUATION_ACTION_ALLOCATE_WORKTREE =
  'allocate-worktree';

/**
 * Continuation action that asks the caller to run gates.
 */
export const SUPERVISOR_CONTINUATION_ACTION_RUN_GATES =
  DEVPLAT_ACTION_RUN_GATES;

/**
 * Continuation action that asks the caller to create a remediation plan.
 */
export const SUPERVISOR_CONTINUATION_ACTION_CREATE_REMEDIATION_PLAN =
  'create-remediation-plan';

/**
 * Continuation action that asks the caller to create a pull request record.
 */
export const SUPERVISOR_CONTINUATION_ACTION_CREATE_PULL_REQUEST_RECORD =
  'create-pull-request-record';

/**
 * Continuation action that asks the caller to update a pull request.
 */
export const SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_UPDATE =
  'submit-pull-request-update';

/**
 * Continuation action that asks the caller to submit a pull request merge.
 */
export const SUPERVISOR_CONTINUATION_ACTION_SUBMIT_PULL_REQUEST_MERGE =
  'submit-pull-request-merge';

/**
 * Continuation action emitted after merge when dependent work may need rebasing.
 */
export const SUPERVISOR_CONTINUATION_ACTION_PLAN_REBASE_DEPENDENTS =
  'plan-rebase-dependents';

/**
 * Tool name for creating a research brief through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_CREATE_RESEARCH_BRIEF =
  'create_research_brief';

/**
 * Tool name for creating a spec record through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_CREATE_SPEC_RECORD =
  'create_spec_record';

/**
 * Tool name for approving a spec record through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_APPROVE_SPEC_RECORD =
  'approve_spec_record';

/**
 * Tool name for creating a slice plan through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_CREATE_SLICE_PLAN =
  'create_slice_plan';

/**
 * Tool name for creating a task record through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_CREATE_TASK_RECORD =
  'create_task_record';

/**
 * Tool name for allocating a worktree through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_ALLOCATE_WORKTREE =
  'allocate_worktree';

/**
 * Tool name for running gates through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_RUN_GATES = 'run_gates';

/**
 * Tool name for creating a remediation plan through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_CREATE_REMEDIATION_PLAN =
  'create_remediation_plan';

/**
 * Tool name for creating a pull request record through the platform tool surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_CREATE_PULL_REQUEST_RECORD =
  'create_pull_request_record';

/**
 * Tool name for submitting a pull request update through the platform surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_UPDATE =
  'submit_pull_request_update';

/**
 * Tool name for submitting a pull request merge through the platform surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_SUBMIT_PULL_REQUEST_MERGE =
  'submit_pull_request_merge';

/**
 * Tool name for planning dependent rebases through the platform surface.
 */
export const SUPERVISOR_CONTINUATION_TOOL_PLAN_REBASE_DEPENDENTS =
  'plan_rebase_dependents';

/**
 * Stable trace prefix for headless continuation decisions.
 */
export const SUPERVISOR_CONTINUATION_TRACE_PREFIX = 'supervisor:continuation';

/**
 * Blocker emitted when a draft spec needs human approval before slicing.
 */
export const SUPERVISOR_CONTINUATION_SPEC_APPROVAL_BLOCKER =
  'spec approval required';

/**
 * Lifecycle statuses treated as complete enough for continuation routing.
 */
export const SUPERVISOR_CONTINUATION_COMPLETE_STATUSES = new Set<string>([
  'approved',
  'complete',
  'merge-ready',
  'merged',
]);
