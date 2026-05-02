import { describe, expect, it } from 'vitest';

import { MergeDecisionArtifactService } from './service.js';
import type { MergeDecisionArtifact } from './codec.js';

type MergeDecisionServiceCase = {
  name: string;
  inputs: {
    artifact: MergeDecisionArtifact;
  };
  mock: () => {
    service: MergeDecisionArtifactService;
  };
  assert: (
    context: { service: MergeDecisionArtifactService },
    inputs: { artifact: MergeDecisionArtifact },
  ) => void;
};

describe('MergeDecisionArtifactService', () => {
  const cases = [
    {
      name: 'executes and explains merge decision artifacts',
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
            decisionId: 'merge-1',
            prNumber: 42,
            actorId: 'operator-1',
            mergeStrategy: 'merge',
            approved: true,
            rationale: 'Ready',
            blockingFindings: [],
          },
        },
      },
      mock: () => ({
        service: new MergeDecisionArtifactService(),
      }),
      assert: (context, inputs) => {
        const artifact = context.service.execute(inputs.artifact);

        expect(artifact.summary).toBe('Merge decision');
        expect(context.service.explain(artifact)).toContain('merge-decision');
      },
    },
  ] satisfies MergeDecisionServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
