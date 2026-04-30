import { describe, expect, it } from 'vitest';

import {
  createPolicyDecision,
  describePolicyDecision,
  evaluatePolicyDecision,
} from './logic.js';
import type { PolicyDecision } from './types.js';

type PolicyDecisionLogicInputs =
  | {
      mode: 'sensitive-set';
      actions: string[];
    }
  | {
      mode: 'evaluate';
      action: string;
      privileged: boolean;
    }
  | {
      mode: 'explicit';
      decision: PolicyDecision;
    }
  | {
      mode: 'classify';
      releaseAction: string;
      publishAction: string;
    };

type PolicyDecisionLogicCase = {
  name: string;
  inputs: PolicyDecisionLogicInputs;
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: PolicyDecisionLogicInputs,
  ) => void;
};

describe('PolicyDecision logic', () => {
  const cases = [
    {
      name: 'flags new risky control actions for approval',
      inputs: {
        mode: 'sensitive-set',
        actions: ['sync-worktree', 'release-worktree', 'update-spec'],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'sensitive-set') {
          throw new Error('expected sensitive-set inputs');
        }

        for (const action of inputs.actions) {
          const decision = evaluatePolicyDecision(action, false);

          expect(decision.allowed).toBe(false);
          expect(decision.requiresApproval).toBe(true);
          expect(decision.auditRequired).toBe(true);
          expect(decision.trace).toContain(`policy:${action}`);
        }
      },
    },
    {
      name: 'flags sensitive actions for approval',
      inputs: {
        mode: 'evaluate',
        action: 'merge-now',
        privileged: false,
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'evaluate') {
          throw new Error('expected evaluate inputs');
        }

        const decision = evaluatePolicyDecision(
          inputs.action,
          inputs.privileged,
        );

        expect(decision.allowed).toBe(false);
        expect(decision.requiresApproval).toBe(true);
        expect(decision.privilegeLevel).toBe('human-approval');
        expect(decision.trace).toContain('policy:merge-now');
        expect(describePolicyDecision(decision)).toContain('merge-now');
      },
    },
    {
      name: 'preserves explicit decisions',
      inputs: {
        mode: 'explicit',
        decision: {
          id: 'policy-1',
          summary: '  allow retry gates  ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          action: 'retry-gates',
          allowed: true,
          requiresApproval: false,
          auditRequired: false,
          privilegeLevel: 'automatic',
          reason: 'safe',
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'explicit') {
          throw new Error('expected explicit inputs');
        }

        const decision = createPolicyDecision(inputs.decision);

        expect(decision.summary).toBe('allow retry gates');
      },
    },
    {
      name: 'allows safe non-privileged actions automatically',
      inputs: {
        mode: 'evaluate',
        action: 'retry-gates',
        privileged: false,
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'evaluate') {
          throw new Error('expected evaluate inputs');
        }

        const decision = evaluatePolicyDecision(
          inputs.action,
          inputs.privileged,
        );

        expect(decision.allowed).toBe(true);
        expect(decision.requiresApproval).toBe(false);
        expect(decision.privilegeLevel).toBe('automatic');
      },
    },
    {
      name: 'classifies destructive and external publish actions',
      inputs: {
        mode: 'classify',
        releaseAction: 'release-worktree',
        publishAction: 'publish-release',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'classify') {
          throw new Error('expected classify inputs');
        }

        const release = evaluatePolicyDecision(inputs.releaseAction, false);
        const publish = evaluatePolicyDecision(inputs.publishAction, false);

        expect(release.privilegeLevel).toBe('destructive');
        expect(publish.privilegeLevel).toBe('external-publish');
        expect(release.auditRequired).toBe(true);
        expect(publish.auditRequired).toBe(true);
      },
    },
  ] satisfies PolicyDecisionLogicCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
