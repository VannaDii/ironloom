import { describe, expect, it } from 'vitest';

import {
  createSupervisorDecision,
  decideNextState,
  describeSupervisorDecision,
  inferSupervisorPhase,
} from './logic.js';

describe('SupervisorDecision logic', () => {
  it('routes blocked actions into review state', () => {
    const decision = decideNextState({
      id: 'policy-merge-now',
      summary: 'policy',
      status: 'review',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      action: 'merge-now',
      allowed: false,
      requiresApproval: true,
      reason: 'requires approval',
    });

    expect(decision.nextState).toBe('review');
    expect(decision.trace).toContain('supervisor:merge-now:review');
  });

  it('routes allowed actions into approved state', () => {
    const decision = decideNextState({
      id: 'policy-retry-gates',
      summary: 'policy',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      action: 'retry-gates',
      allowed: true,
      requiresApproval: false,
      reason: 'safe',
    });
    const executed = createSupervisorDecision(decision);

    expect(decision.approved).toBe(true);
    expect(describeSupervisorDecision(executed)).toContain(
      'retry-gates -> approved',
    );
  });

  it('routes decisions through lifecycle phases', () => {
    const cases = [
      {
        inputs: {
          action: 'research-topic',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('research');
        },
      },
      {
        inputs: {
          action: 'approve-spec',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('spec');
        },
      },
      {
        inputs: {
          action: 'create-slice-plan',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('slicing');
        },
      },
      {
        inputs: {
          action: 'retry-gates',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('gates');
        },
      },
      {
        inputs: {
          action: 'create-remediation-plan',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('remediation');
        },
      },
      {
        inputs: {
          action: 'autofix-finding',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('remediation');
        },
      },
      {
        inputs: {
          action: 'merge-now',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('merge');
        },
      },
      {
        inputs: {
          action: 'continue-cycle',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('continuation');
        },
      },
      {
        inputs: {
          action: 'rebase-dependents',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('continuation');
        },
      },
      {
        inputs: {
          action: 'sync-worktree',
        },
        mock: () => undefined,
        assert: (phase: ReturnType<typeof inferSupervisorPhase>) => {
          expect(phase).toBe('implementation');
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(inferSupervisorPhase(testCase.inputs.action));
    }

    const decisionCases = [
      {
        inputs: {
          decision: {
            id: 'supervisor-review',
            summary: ' route review ',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-05T00:00:00.000Z',
            action: 'review-findings',
            nextState: 'review',
            approved: false,
            notes: ['needs review'],
          },
        },
        mock: () => undefined,
        assert: (decision: ReturnType<typeof createSupervisorDecision>) => {
          expect(decision.phase).toBe('review');
          expect(decision.routedTo).toBe('review');
        },
      },
    ];

    for (const testCase of decisionCases) {
      testCase.mock();
      testCase.assert(createSupervisorDecision(testCase.inputs.decision));
    }
  });
});
