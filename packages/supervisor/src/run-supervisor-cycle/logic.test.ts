import { describe, expect, it } from 'vitest';

import {
  createSupervisorDecision,
  createSupervisorRoutePlan,
  decideNextState,
  describeSupervisorDecision,
  inferSupervisorPhase,
} from './logic.js';
import type {
  SupervisorDecision,
  SupervisorLifecycleSignal,
  SupervisorPhase,
} from './types.js';

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
  ] satisfies SupervisorLogicCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      testCase.mock();

      testCase.assert(testCase.inputs);
    });
  }
});
