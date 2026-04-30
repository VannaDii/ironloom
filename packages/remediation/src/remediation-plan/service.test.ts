import { describe, expect, it } from 'vitest';

import type { ReviewFinding } from '@vannadii/devplat-review';

import { RemediationPlanService } from './service.js';
import type { RemediationPlan } from './types.js';

type RemediationPlanServiceInputs =
  | {
      mode: 'findings';
      findings: ReviewFinding[];
      autofix: boolean;
    }
  | {
      mode: 'manual';
      plan: RemediationPlan;
    };

type RemediationPlanServiceCase = {
  name: string;
  inputs: RemediationPlanServiceInputs;
  mock: () => {
    service: RemediationPlanService;
  };
  assert: (
    context: { service: RemediationPlanService },
    inputs: RemediationPlanServiceInputs,
  ) => void;
};

describe('RemediationPlanService', () => {
  const cases = [
    {
      name: 'derives remediation plans from review findings',
      inputs: {
        mode: 'findings',
        findings: [
          {
            findingId: 'finding-001',
            severity: 'critical',
            path: 'packages/openclaw/src/index.ts',
            message: 'Validation gap',
            rationale: 'Invalid inputs could bypass policy.',
            fixRecommendation: 'Decode and reject invalid payloads.',
            blocking: true,
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        autofix: true,
      },
      mock: () => ({
        service: new RemediationPlanService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'findings') {
          throw new Error('expected findings inputs');
        }

        const snapshot = context.service.fromFindings(
          inputs.findings,
          inputs.autofix,
        );

        expect(snapshot.approvalRequired).toBe(true);
        expect(snapshot.findingIds).toEqual(['finding-001']);
        expect(context.service.explain(snapshot)).toContain('remediation-');
      },
    },
    {
      name: 'covers create and execute helpers for manual remediation',
      inputs: {
        mode: 'manual',
        plan: {
          planId: 'manual-plan',
          findingIds: ['finding-002', 'finding-002'],
          actions: ['  update tests  ', 'update tests'],
          autofix: false,
          approvalRequired: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new RemediationPlanService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'manual') {
          throw new Error('expected manual inputs');
        }

        const created = context.service.create(inputs.plan);
        const executed = context.service.execute(created);

        expect(created.approvalRequired).toBe(true);
        expect(executed.actions).toEqual(['update tests']);
      },
    },
  ] satisfies RemediationPlanServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
