import { describe, expect, it } from 'vitest';

import {
  createMergeDecisionArtifact,
  describeMergeDecisionArtifact,
} from './logic.js';
import type { MergeDecisionArtifact } from './codec.js';

type MergeDecisionLogicCase = {
  name: string;
  inputs: {
    artifact: MergeDecisionArtifact;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { artifact: MergeDecisionArtifact },
  ) => void;
};

describe('MergeDecisionArtifact logic', () => {
  const cases = [
    {
      name: 'normalizes merge decision artifacts',
      inputs: {
        artifact: {
          id: 'artifact-merge-1',
          artifactType: 'merge-decision',
          version: 1,
          summary: ' Merge decision ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            decisionId: ' merge-1 ',
            prNumber: 42,
            actorId: ' operator-1 ',
            mergeStrategy: 'squash',
            approved: true,
            rationale: ' Ready to merge ',
            blockingFindings: [' none '],
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const artifact = createMergeDecisionArtifact(inputs.artifact);

        expect(artifact.artifactType).toBe('merge-decision');
        expect(artifact.payload).toMatchObject({
          decisionId: 'merge-1',
          actorId: 'operator-1',
          rationale: 'Ready to merge',
          blockingFindings: ['none'],
        });
      },
    },
    {
      name: 'describes merge decision artifacts',
      inputs: {
        artifact: {
          id: 'artifact-merge-1',
          artifactType: 'merge-decision',
          version: 1,
          summary: 'Merge decision',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            decisionId: 'merge-1',
            prNumber: 42,
            actorId: 'operator-1',
            mergeStrategy: 'squash',
            approved: true,
            rationale: 'Ready to merge',
            blockingFindings: [],
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const description = describeMergeDecisionArtifact(inputs.artifact);

        expect(description).toContain('pr #42 approved');
      },
    },
    {
      name: 'describes blocked merge decisions',
      inputs: {
        artifact: {
          id: 'artifact-merge-2',
          artifactType: 'merge-decision',
          version: 1,
          summary: 'Merge decision',
          status: 'blocked',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            decisionId: 'merge-2',
            prNumber: 77,
            actorId: 'operator-1',
            mergeStrategy: 'merge',
            approved: false,
            rationale: 'Blocked on review findings',
            blockingFindings: ['finding-1'],
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const description = describeMergeDecisionArtifact(inputs.artifact);

        expect(description).toContain('pr #77 blocked');
      },
    },
  ] satisfies MergeDecisionLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
