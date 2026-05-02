import { describe, expect, it } from 'vitest';

import {
  createRebaseResultArtifact,
  describeRebaseResultArtifact,
} from './logic.js';
import type { RebaseResultArtifact } from './codec.js';

type RebaseResultLogicCase = {
  name: string;
  inputs: {
    artifact: RebaseResultArtifact;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { artifact: RebaseResultArtifact },
  ) => void;
};

describe('RebaseResultArtifact logic', () => {
  const cases = [
    {
      name: 'normalizes rebase result artifacts',
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
            resultId: ' rebase-1 ',
            mergedPrNumber: 42,
            baseBranch: ' main ',
            branchName: ' feature/x ',
            rebased: true,
            conflictsDetected: false,
            details: ' Rebased cleanly ',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const artifact = createRebaseResultArtifact(inputs.artifact);

        expect(artifact.artifactType).toBe('rebase-result');
        expect(artifact.payload).toMatchObject({
          resultId: 'rebase-1',
          baseBranch: 'main',
          branchName: 'feature/x',
          details: 'Rebased cleanly',
        });
      },
    },
    {
      name: 'describes rebase result artifacts',
      inputs: {
        artifact: {
          id: 'artifact-rebase-1',
          artifactType: 'rebase-result',
          version: 1,
          summary: 'Rebase result',
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
      mock: () => ({}),
      assert: (context, inputs) => {
        const description = describeRebaseResultArtifact(inputs.artifact);

        expect(description).toContain('feature/x rebased');
      },
    },
    {
      name: 'describes failed rebases',
      inputs: {
        artifact: {
          id: 'artifact-rebase-2',
          artifactType: 'rebase-result',
          version: 1,
          summary: 'Rebase result',
          status: 'blocked',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            resultId: 'rebase-2',
            mergedPrNumber: 43,
            baseBranch: 'main',
            branchName: 'feature/y',
            rebased: false,
            conflictsDetected: true,
            details: 'Conflicts detected',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const description = describeRebaseResultArtifact(inputs.artifact);

        expect(description).toContain('feature/y not rebased');
      },
    },
  ] satisfies RebaseResultLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
