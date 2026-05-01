import { describe, expect, it } from 'vitest';

import { SlicePlanCodec } from './codec.js';
import {
  buildSliceDependencyGraph,
  buildSliceWorkPacket,
  createSlicePlan,
  describeSlicePlan,
  isSliceReady,
} from './logic.js';
import type { SlicePlan } from './types.js';

describe('SlicePlan logic', () => {
  const cases = [
    {
      name: 'normalizes dependency-aware slice plans',
      inputs: {
        plan: {
          sliceId: 'slice-001',
          specId: 'spec-001',
          title: '  Add operator retry action  ',
          dependsOn: ['slice-000', 'slice-000'],
          acceptanceCriteria: ['Retry gates command', 'Retry gates command'],
          doneConditions: ['Tests added', 'Docs updated'],
          size: 'small',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        completedSliceIds: ['slice-000'],
      },
      mock: () => undefined,
      assert: (inputs: {
        plan: SlicePlan;
        completedSliceIds: readonly string[];
      }) => {
        const snapshot = createSlicePlan(inputs.plan);

        expect(snapshot.dependsOn).toEqual(['slice-000']);
        expect(snapshot.acceptanceCriteria).toEqual(['Retry gates command']);
        expect(isSliceReady(snapshot, inputs.completedSliceIds)).toBe(true);
        expect(describeSlicePlan(snapshot)).toContain('Slice plan');
      },
    },
    {
      name: 'derives dependency graph metadata and PR-sized work packets',
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
        },
      },
      mock: () => undefined,
      assert: (inputs: { plan: SlicePlan }) => {
        const plan = createSlicePlan(inputs.plan);

        expect(plan.dependencyGraph).toMatchObject({
          graphId: 'slice-002:dependencies',
          generatedAt: '2026-04-05T00:00:00.000Z',
          blockedBy: ['slice-001'],
          dependencyCount: 1,
          edges: [{ fromSliceId: 'slice-001', toSliceId: 'slice-002' }],
        });
        expect(plan.workPacket).toMatchObject({
          packetId: 'slice-002:work-packet',
          branchName: 'devplat/slice-002',
          estimatedPullRequestCount: 2,
          estimatedTaskCount: 2,
          pullRequestTitle: 'feat: implement Gate remediation',
          reviewFocus: ['Classify gates'],
          taskIds: ['slice-002-task-1', 'slice-002-task-2'],
        });
        expect(SlicePlanCodec.decode(plan)._tag).toBe('Right');
        expect(buildSliceDependencyGraph(plan).blockedBy).toEqual([
          'slice-001',
        ]);
        expect(buildSliceWorkPacket(plan).branchName).toBe('devplat/slice-002');
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
