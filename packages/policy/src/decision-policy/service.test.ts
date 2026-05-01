import { describe, expect, it } from 'vitest';

import { DecisionPolicyService } from './service.js';
import type { PolicyActionCategory, PolicyDecision } from './types.js';

type DecisionPolicyServiceInputs =
  | {
      mode: 'evaluate';
      action: string;
      privileged: boolean;
    }
  | {
      mode: 'execute';
      decision: PolicyDecision;
    }
  | {
      mode: 'lifecycle';
      action: string;
      privileged: boolean;
      category: PolicyActionCategory;
      nextAction: string;
    };

type DecisionPolicyServiceCase = {
  name: string;
  inputs: DecisionPolicyServiceInputs;
  mock: () => {
    service: DecisionPolicyService;
  };
  assert: (
    context: { service: DecisionPolicyService },
    inputs: DecisionPolicyServiceInputs,
  ) => void;
};

describe('DecisionPolicyService', () => {
  const cases = [
    {
      name: 'evaluates control actions for privileged paths',
      inputs: {
        mode: 'evaluate',
        action: 'approve-this',
        privileged: true,
      },
      mock: () => ({
        service: new DecisionPolicyService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'evaluate') {
          throw new Error('expected evaluate inputs');
        }

        const decision = context.service.evaluateControlAction(
          inputs.action,
          inputs.privileged,
        );

        expect(decision.allowed).toBe(false);
        expect(context.service.explain(decision)).toContain('approve-this');
      },
    },
    {
      name: 'covers direct execute for explicit policy decisions',
      inputs: {
        mode: 'execute',
        decision: {
          id: 'policy-retry-gates',
          summary: '  retry gates  ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          action: 'retry-gates',
          allowed: true,
          requiresApproval: false,
          reason: 'safe',
        },
      },
      mock: () => ({
        service: new DecisionPolicyService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute') {
          throw new Error('expected execute inputs');
        }

        const decision = context.service.execute(inputs.decision);

        expect(decision.summary).toBe('retry gates');
      },
    },
    {
      name: 'evaluates lifecycle policy actions with caller next action',
      inputs: {
        mode: 'lifecycle',
        action: 'autofix-review',
        privileged: false,
        category: 'autofix',
        nextAction: 'request-autofix-approval',
      },
      mock: () => ({
        service: new DecisionPolicyService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'lifecycle') {
          throw new Error('expected lifecycle inputs');
        }

        const decision = context.service.evaluateLifecycleAction(
          inputs.action,
          inputs.privileged,
        );

        expect(decision.actionCategory).toBe(inputs.category);
        expect(decision.nextAction).toBe(inputs.nextAction);
        expect(decision.allowed).toBe(false);
        expect(decision.auditReason).toContain('autofix-review');
      },
    },
  ] satisfies DecisionPolicyServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
