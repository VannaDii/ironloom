import { describe, expect, it } from 'vitest';

import {
  createRemediationPlan,
  createRemediationResult,
  createRemediationResultSummary,
  describeRemediationPlan,
} from './logic.js';
import type { RemediationPlan } from './types.js';

describe('RemediationPlan logic', () => {
  const cases = [
    {
      name: 'normalizes remediation actions and approval requirements',
      inputs: {
        plan: {
          planId: 'plan-001',
          findingIds: ['finding-001', 'finding-001'],
          actions: ['Fix decoder', 'Fix decoder'],
          autofix: true,
          approvalRequired: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        plan: Parameters<typeof createRemediationPlan>[0];
      }) => {
        const snapshot = createRemediationPlan(inputs.plan);

        expect(snapshot.findingIds).toEqual(['finding-001']);
        expect(snapshot.actions).toEqual(['Fix decoder']);
        expect(snapshot.nextAction).toBe('apply-remediation');
        expect(describeRemediationPlan(snapshot)).toContain('plan-001');
      },
    },
    {
      name: 'requests approval when remediation is not eligible for autofix',
      inputs: {
        plan: {
          planId: 'plan-approval',
          findingIds: ['finding-approval'],
          actions: ['Manual fix'],
          autofix: false,
          approvalRequired: false,
          updatedAt: '2026-04-05T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        plan: Parameters<typeof createRemediationPlan>[0];
      }) => {
        const plan = createRemediationPlan(inputs.plan);

        expect(plan.approvalRequired).toBe(true);
        expect(plan.nextAction).toBe('request-approval');
      },
    },
    {
      name: 'records remediation results and next actions',
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
      assert: (inputs: { plan: RemediationPlan }) => {
        const plan = createRemediationPlan(inputs.plan);

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
    {
      name: 'normalizes individual remediation results',
      inputs: {
        result: {
          action: ' Run tests ',
          success: true,
          detail: ' Passed ',
          completedAt: '2026-04-05T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        result: Parameters<typeof createRemediationResult>[0];
      }) => {
        expect(createRemediationResult(inputs.result).detail).toBe('Passed');
      },
    },
    {
      name: 'summarizes remediation artifacts and unresolved findings',
      inputs: {
        plan: {
          planId: 'plan-003',
          findingIds: ['finding-001', 'finding-002'],
          actions: ['Apply fix', 'Update docs'],
          autofix: true,
          approvalRequired: false,
          updatedAt: '2026-04-05T00:00:00.000Z',
          unresolvedFindingIds: ['finding-002'],
          results: [
            {
              action: 'Apply fix',
              success: true,
              artifactId: 'artifact-fix',
              detail: 'Fixed',
              completedAt: '2026-04-05T00:01:00.000Z',
            },
            {
              action: 'Update docs',
              success: false,
              detail: 'Needs manual edit',
              completedAt: '2026-04-05T00:02:00.000Z',
            },
          ],
        } satisfies RemediationPlan,
      },
      mock: () => undefined,
      assert: (inputs: { plan: RemediationPlan }) => {
        const summary = createRemediationResultSummary(inputs.plan);

        expect(summary.successfulActions).toEqual(['Apply fix']);
        expect(summary.failedActions).toEqual(['Update docs']);
        expect(summary.artifactIds).toEqual(['artifact-fix']);
        expect(summary.unresolvedFindingIds).toEqual(['finding-002']);
        expect(summary.complete).toBe(false);
      },
    },
    {
      name: 'summarizes unresolved findings when no results are recorded',
      inputs: {
        plan: {
          planId: 'plan-empty-results',
          findingIds: ['finding-001'],
          actions: ['Apply fix'],
          autofix: true,
          approvalRequired: false,
          updatedAt: '2026-04-05T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        plan: Parameters<typeof createRemediationPlan>[0];
      }) => {
        const summary = createRemediationResultSummary(inputs.plan);

        expect(summary.successfulActions).toEqual([]);
        expect(summary.unresolvedFindingIds).toEqual(['finding-001']);
        expect(summary.complete).toBe(false);
      },
    },
    {
      name: 'marks remediation summaries complete when all findings resolve',
      inputs: {
        plan: {
          planId: 'plan-004',
          findingIds: ['finding-001'],
          actions: ['Apply fix'],
          autofix: true,
          approvalRequired: false,
          updatedAt: '2026-04-05T00:00:00.000Z',
          unresolvedFindingIds: [],
          results: [
            {
              action: 'Apply fix',
              success: true,
              artifactId: 'artifact-fix',
              detail: 'Fixed',
              completedAt: '2026-04-05T00:01:00.000Z',
            },
          ],
        } satisfies RemediationPlan,
      },
      mock: () => undefined,
      assert: (inputs: { plan: RemediationPlan }) => {
        const summary = createRemediationResultSummary(inputs.plan);

        expect(summary.complete).toBe(true);
        expect(summary.unresolvedFindingIds).toEqual([]);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  }
});
