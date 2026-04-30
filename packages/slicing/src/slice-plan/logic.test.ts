import { describe, expect, it } from 'vitest';

import {
  buildSliceDependencyGraph,
  buildSliceWorkPacket,
  createSlicePlan,
  describeSlicePlan,
  isSliceReady,
} from './logic.js';
import type { SlicePlan } from './types.js';

describe('SlicePlan logic', () => {
  it('normalizes dependency-aware slice plans', () => {
    const snapshot = createSlicePlan({
      sliceId: 'slice-001',
      specId: 'spec-001',
      title: '  Add operator retry action  ',
      dependsOn: ['slice-000', 'slice-000'],
      acceptanceCriteria: ['Retry gates command', 'Retry gates command'],
      doneConditions: ['Tests added', 'Docs updated'],
      size: 'small',
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(snapshot.dependsOn).toEqual(['slice-000']);
    expect(snapshot.acceptanceCriteria).toEqual(['Retry gates command']);
    expect(isSliceReady(snapshot, ['slice-000'])).toBe(true);
    expect(describeSlicePlan(snapshot)).toContain('Slice plan');
  });

  it('derives dependency graphs and PR-sized work packets', () => {
    const cases = [
      {
        inputs: {
          plan: {
            sliceId: 'slice-002',
            specId: 'spec-001',
            title: ' Gate remediation ',
            dependsOn: ['slice-001', 'slice-001'],
            acceptanceCriteria: ['Classify gates'],
            doneConditions: ['Add tests', 'Update docs'],
            size: 'large',
            updatedAt: '2026-04-05T00:00:00.000Z',
          } satisfies SlicePlan,
        },
        mock: () => undefined,
        assert: (plan: ReturnType<typeof createSlicePlan>) => {
          expect(plan.dependencyGraph?.blockedBy).toEqual(['slice-001']);
          expect(plan.dependencyGraph?.edges).toEqual([
            { fromSliceId: 'slice-001', toSliceId: 'slice-002' },
          ]);
          expect(plan.workPacket?.estimatedPullRequestCount).toBe(2);
          expect(plan.workPacket?.taskIds).toEqual([
            'slice-002-task-1',
            'slice-002-task-2',
          ]);
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      const plan = createSlicePlan(testCase.inputs.plan);
      testCase.assert(plan);
      expect(buildSliceDependencyGraph(plan).blockedBy).toEqual(['slice-001']);
      expect(buildSliceWorkPacket(plan).branchName).toBe('devplat/slice-002');
    }
  });
});
