import { describe, expect, it } from 'vitest';

import {
  createRemediationPlan,
  createRemediationResult,
  describeRemediationPlan,
} from './logic.js';
import type { RemediationPlan } from './types.js';

describe('RemediationPlan logic', () => {
  it('normalizes remediation actions and approval requirements', () => {
    const snapshot = createRemediationPlan({
      planId: 'plan-001',
      findingIds: ['finding-001', 'finding-001'],
      actions: ['Fix decoder', 'Fix decoder'],
      autofix: true,
      approvalRequired: false,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(snapshot.findingIds).toEqual(['finding-001']);
    expect(snapshot.actions).toEqual(['Fix decoder']);
    expect(describeRemediationPlan(snapshot)).toContain('plan-001');
  });

  it('records remediation results and next actions', () => {
    const cases = [
      {
        inputs: {
          plan: {
            planId: 'plan-002',
            findingIds: ['finding-001'],
            actions: ['Apply fix'],
            autofix: true,
            approvalRequired: false,
            updatedAt: '2026-04-05T00:00:00.000Z',
            unresolvedFindingIds: [],
            results: [
              {
                action: ' Apply fix ',
                success: true,
                artifactId: 'artifact-1',
                detail: ' Fixed ',
                completedAt: '2026-04-05T00:01:00.000Z',
              },
            ],
          } satisfies RemediationPlan,
        },
        mock: () => undefined,
        assert: (plan: ReturnType<typeof createRemediationPlan>) => {
          expect(plan.results).toEqual([
            {
              action: 'Apply fix',
              success: true,
              artifactId: 'artifact-1',
              detail: 'Fixed',
              completedAt: '2026-04-05T00:01:00.000Z',
            },
          ]);
          expect(plan.unresolvedFindingIds).toEqual([]);
          expect(plan.nextAction).toBe('retry-gates');
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(createRemediationPlan(testCase.inputs.plan));
    }

    const resultCases = [
      {
        inputs: {
          result: {
            action: ' Run tests ',
            success: true,
            detail: ' Passed ',
            completedAt: '2026-04-05T00:00:00.000Z',
          },
        },
        mock: () => undefined,
        assert: (result: ReturnType<typeof createRemediationResult>) => {
          expect(result.detail).toBe('Passed');
        },
      },
    ];

    for (const testCase of resultCases) {
      testCase.mock();
      testCase.assert(createRemediationResult(testCase.inputs.result));
    }
  });
});
