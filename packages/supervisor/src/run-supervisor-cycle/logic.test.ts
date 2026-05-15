import { describe, expect, it } from 'vitest';

import {
  createSupervisorContinuation,
  createSupervisorDecision,
  createSupervisorRoutePlan,
  decideNextState,
  describeSupervisorDecision,
  inferSupervisorPhase,
} from './logic.js';
import type {
  SupervisorDecision,
  SupervisorContinuationRequest,
  SupervisorLifecycleSignal,
  SupervisorPhase,
} from './codec.js';

type SupervisorLogicInputs =
  | {
      mode: 'policy';
      policyDecision: Parameters<typeof decideNextState>[0];
    }
  | {
      mode: 'phase';
      action: string;
    }
  | {
      mode: 'decision';
      decision: SupervisorDecision;
    }
  | {
      mode: 'route-plan';
      action: string;
      approved: boolean;
      currentPhase: SupervisorPhase;
      lifecycleSignals: SupervisorLifecycleSignal[];
    }
  | {
      mode: 'continuation';
      request: SupervisorContinuationRequest;
      expectedToolName: string;
      expectedStatus: SupervisorDecision['status'];
      expectedMissingArtifactTypes: string[];
    };

type SupervisorLogicCase = {
  name: string;
  inputs: SupervisorLogicInputs;
  mock: () => void;
  assert: (inputs: SupervisorLogicInputs) => void;
};

describe('SupervisorDecision logic', () => {
  const cases = [
    {
      name: 'routes blocked actions into review state',
      inputs: {
        mode: 'policy',
        policyDecision: {
          id: 'policy-merge-now',
          summary: 'policy',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          action: 'merge-now',
          allowed: false,
          requiresApproval: true,
          reason: 'requires approval',
        },
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'policy') {
          throw new Error('expected policy inputs');
        }

        const decision = decideNextState(inputs.policyDecision);

        expect(decision.nextState).toBe('review');
        expect(decision.routePlan?.status).toBe('blocked');
        expect(decision.routePlan?.routedTo).toBe('policy-service');
        expect(decision.trace).toContain('supervisor:merge-now:review');
      },
    },
    {
      name: 'routes allowed actions into approved state',
      inputs: {
        mode: 'policy',
        policyDecision: {
          id: 'policy-retry-gates',
          summary: 'policy',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          action: 'retry-gates',
          allowed: true,
          requiresApproval: false,
          reason: 'safe',
        },
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'policy') {
          throw new Error('expected policy inputs');
        }

        const decision = decideNextState(inputs.policyDecision);
        const executed = createSupervisorDecision(decision);

        expect(decision.approved).toBe(true);
        expect(executed.routePlan?.nextPhase).toBe('review');
        expect(describeSupervisorDecision(executed)).toContain(
          'retry-gates -> approved',
        );
      },
    },
    {
      name: 'infers all lifecycle phases from actions',
      inputs: {
        mode: 'phase',
        action: 'research-topic',
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'phase') {
          throw new Error('expected phase inputs');
        }

        const phaseCases = [
          { action: inputs.action, expected: 'research' },
          { action: 'approve-spec', expected: 'spec' },
          { action: 'create-slice-plan', expected: 'slicing' },
          { action: 'retry-gates', expected: 'gates' },
          { action: 'review-findings', expected: 'review' },
          { action: 'create-remediation-plan', expected: 'remediation' },
          { action: 'autofix-finding', expected: 'remediation' },
          { action: 'merge-now', expected: 'merge' },
          { action: 'continue-cycle', expected: 'continuation' },
          { action: 'rebase-dependents', expected: 'continuation' },
          { action: 'sync-worktree', expected: 'implementation' },
        ] satisfies {
          action: string;
          expected: SupervisorPhase;
        }[];

        for (const phaseCase of phaseCases) {
          expect(inferSupervisorPhase(phaseCase.action)).toBe(
            phaseCase.expected,
          );
        }
      },
    },
    {
      name: 'routes decisions with waiting lifecycle signals',
      inputs: {
        mode: 'decision',
        decision: {
          id: 'supervisor-review',
          summary: ' route review ',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-05T00:00:00.000Z',
          action: 'review-findings',
          nextState: 'review',
          approved: true,
          notes: ['needs review'],
          lifecycleSignals: [
            {
              phase: 'review',
              ready: false,
              artifactIds: [' review-artifact-1 ', 'review-artifact-1'],
              blockers: [' blocking finding '],
              nextAction: ' create-remediation-plan ',
            },
          ],
        },
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'decision') {
          throw new Error('expected decision inputs');
        }

        const decision = createSupervisorDecision(inputs.decision);

        expect(decision.phase).toBe('review');
        expect(decision.routedTo).toBe('review-findings-service');
        expect(decision.routePlan).toMatchObject({
          currentPhase: 'review',
          nextPhase: 'review',
          status: 'waiting',
          nextAction: 'create-remediation-plan',
          blockers: ['blocking finding'],
          artifactIds: ['review-artifact-1'],
        });
      },
    },
    {
      name: 'routes approved ready phases to the next lifecycle owner',
      inputs: {
        mode: 'route-plan',
        action: 'approve-spec',
        approved: true,
        currentPhase: 'spec',
        lifecycleSignals: [
          {
            phase: 'spec',
            ready: true,
            artifactIds: ['spec-artifact-1'],
            blockers: [],
            nextAction: 'slice-spec',
          },
        ],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'route-plan') {
          throw new Error('expected route-plan inputs');
        }

        const routePlan = createSupervisorRoutePlan(inputs);

        expect(routePlan).toEqual({
          currentPhase: 'spec',
          nextPhase: 'slicing',
          routedTo: 'slice-plan-service',
          nextAction: 'run-slicing',
          status: 'ready',
          blockers: [],
          artifactIds: ['spec-artifact-1'],
          auditReason: 'Routed spec to slicing',
        });
      },
    },
    {
      name: 'keeps continuation as terminal route',
      inputs: {
        mode: 'route-plan',
        action: 'continue-cycle',
        approved: true,
        currentPhase: 'continuation',
        lifecycleSignals: [],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'route-plan') {
          throw new Error('expected route-plan inputs');
        }

        const routePlan = createSupervisorRoutePlan(inputs);

        expect(routePlan.nextPhase).toBe('continuation');
        expect(routePlan.routedTo).toBe('branching-service');
      },
    },
    {
      name: 'starts headless work by requesting research',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-empty',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [],
        },
        expectedToolName: 'create_research_brief',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: ['research-brief'],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'create-research-brief',
          phase: 'research',
          toolName: inputs.expectedToolName,
          requiresHumanApproval: false,
        });
        expect(decision.status).toBe(inputs.expectedStatus);
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'stops headless work for spec approval before slicing',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-draft-spec',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'draft',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'approve_spec_record',
        expectedStatus: 'review',
        expectedMissingArtifactTypes: [],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'request-spec-approval',
          phase: 'spec',
          toolName: inputs.expectedToolName,
          requiresHumanApproval: true,
        });
        expect(decision.status).toBe(inputs.expectedStatus);
        expect(decision.blockers).toEqual(['spec approval required']);
      },
    },
    {
      name: 'routes completed research to spec creation',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-research',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'create_spec_record',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: ['spec-record'],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'create-spec-record',
          phase: 'spec',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'routes approved specs to slice planning',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-approved-spec',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'create_slice_plan',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: ['slice-plan'],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'create-slice-plan',
          phase: 'slicing',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.artifactIds).toEqual([
          'research-artifact-1',
          'spec-artifact-1',
        ]);
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'routes claimed tasks to worktree allocation',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-task',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'slice-artifact-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'task-artifact-1',
              artifactType: 'task-record',
              status: 'claimed',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'allocate_worktree',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: ['worktree-allocation'],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'allocate-worktree',
          phase: 'implementation',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'routes implementation artifacts to gates',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-worktree',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'slice-artifact-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'task-artifact-1',
              artifactType: 'task-record',
              status: 'claimed',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'worktree-artifact-1',
              artifactType: 'worktree-allocation',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'run_gates',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: ['gate-run-report'],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'run-gates',
          phase: 'gates',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'routes failed gates to remediation',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-failed-gates',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'slice-artifact-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'task-artifact-1',
              artifactType: 'task-record',
              status: 'claimed',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'worktree-artifact-1',
              artifactType: 'worktree-allocation',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'gate-artifact-1',
              artifactType: 'gate-run-report',
              status: 'failed',
              updatedAt: '2026-05-15T00:00:00.000Z',
              nextAction: 'create-remediation-plan',
            },
          ],
        },
        expectedToolName: 'create_remediation_plan',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: ['remediation-plan'],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'create-remediation-plan',
          phase: 'remediation',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.artifactIds).toContain('gate-artifact-1');
      },
    },
    {
      name: 'routes passed gates to pull request projection',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-passed-gates',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'slice-artifact-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'task-artifact-1',
              artifactType: 'task-record',
              status: 'claimed',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'worktree-artifact-1',
              artifactType: 'worktree-allocation',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'gate-artifact-1',
              artifactType: 'gate-run-report',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'create_pull_request_record',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: ['pull-request-record'],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'create-pull-request-record',
          phase: 'merge',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'routes merge-ready pull requests to merge submission',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-merge-ready',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'slice-artifact-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'task-artifact-1',
              artifactType: 'task-record',
              status: 'claimed',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'worktree-artifact-1',
              artifactType: 'worktree-allocation',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'gate-artifact-1',
              artifactType: 'gate-run-report',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'pr-artifact-1',
              artifactType: 'pull-request-record',
              status: 'merge-ready',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'submit_pull_request_merge',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: [],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'submit-pull-request-merge',
          phase: 'merge',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'routes non-ready pull requests to update submission',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-pr-update',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'slice-artifact-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'task-artifact-1',
              artifactType: 'task-record',
              status: 'claimed',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'worktree-artifact-1',
              artifactType: 'worktree-allocation',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'gate-artifact-1',
              artifactType: 'gate-run-report',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'pr-artifact-1',
              artifactType: 'pull-request-record',
              status: 'review',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'submit_pull_request_update',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: [],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'submit-pull-request-update',
          phase: 'merge',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
    {
      name: 'routes merged pull requests to dependent rebase planning',
      inputs: {
        mode: 'continuation',
        request: {
          requestId: 'continue-merged-pr',
          repositoryKey: 'VannaDii/devplat',
          objective: 'Build the first headless continuation lane.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [
            {
              artifactId: 'research-artifact-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'spec-artifact-1',
              artifactType: 'spec-record',
              status: 'approved',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'slice-artifact-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'task-artifact-1',
              artifactType: 'task-record',
              status: 'claimed',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'worktree-artifact-1',
              artifactType: 'worktree-allocation',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'gate-artifact-1',
              artifactType: 'gate-run-report',
              status: 'complete',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
            {
              artifactId: 'pr-artifact-1',
              artifactType: 'pull-request-record',
              status: 'merged',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
        expectedToolName: 'plan_rebase_dependents',
        expectedStatus: 'running',
        expectedMissingArtifactTypes: [],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'continuation') {
          throw new Error('expected continuation inputs');
        }

        const decision = createSupervisorContinuation(inputs.request);

        expect(decision.nextAction).toMatchObject({
          kind: 'plan-rebase-dependents',
          phase: 'continuation',
          toolName: inputs.expectedToolName,
        });
        expect(decision.nextAction.missingArtifactTypes).toEqual(
          inputs.expectedMissingArtifactTypes,
        );
      },
    },
  ] satisfies SupervisorLogicCase[];

  it.each(cases)('$name', ({ inputs, mock, assert }) => {
    expect.hasAssertions();
    mock();

    assert(inputs);
  });
});
