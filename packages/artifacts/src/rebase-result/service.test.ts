import { describe, expect, it } from 'vitest';

import { RebaseResultArtifactService } from './service.js';
import type { RebaseResultArtifact } from './types.js';

type RebaseResultServiceCase = {
  name: string;
  inputs: {
    artifact: RebaseResultArtifact;
  };
  mock: () => {
    service: RebaseResultArtifactService;
  };
  assert: (
    context: { service: RebaseResultArtifactService },
    inputs: { artifact: RebaseResultArtifact },
  ) => void;
};

describe('RebaseResultArtifactService', () => {
  const cases = [
    {
      name: 'executes and explains rebase result artifacts',
      inputs: {
        artifact: {
          id: 'artifact-rebase-1',
          artifactType: 'rebase-result',
          version: 1,
          summary: ' Rebase result ',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            resultId: 'rebase-1',
            mergedPrNumber: 42,
            baseBranch: 'main',
            branchName: 'feature/x',
            rebased: true,
            conflictsDetected: false,
            details: 'Rebased cleanly',
          },
        },
      },
      mock: () => ({
        service: new RebaseResultArtifactService(),
      }),
      assert: (context, inputs) => {
        const artifact = context.service.execute(inputs.artifact);

        expect(artifact.summary).toBe('Rebase result');
        expect(context.service.explain(artifact)).toContain('rebase-result');
      },
    },
  ] satisfies RebaseResultServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
