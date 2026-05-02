import { describe, expect, it } from 'vitest';

import { SlicePlanService } from './service.js';

describe('SlicePlanService', () => {
  const cases = [
    {
      name: 'evaluates execution readiness for planned slices',
      inputs: {
        plan: {
          sliceId: 'slice-001',
          specId: 'spec-001',
          title: 'Operator retry action',
          dependsOn: ['slice-000'],
          acceptanceCriteria: ['Expose retry button'],
          doneConditions: ['Tests pass'],
          size: 'small',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        completedSliceIds: ['slice-000'],
      },
      mock: () => new SlicePlanService(),
      assert: (
        service: SlicePlanService,
        inputs: {
          plan: Parameters<SlicePlanService['execute']>[0];
          completedSliceIds: string[];
        },
      ) => {
        const snapshot = service.execute(inputs.plan);

        expect(
          service.readyForExecution(snapshot, inputs.completedSliceIds),
        ).toBe(true);
        expect(service.explain(snapshot)).toContain('Slice plan');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.assert(testCase.mock(), testCase.inputs);
  });
});
