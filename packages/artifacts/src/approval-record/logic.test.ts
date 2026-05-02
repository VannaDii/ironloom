import { describe, expect, it } from 'vitest';

import {
  createApprovalRecordArtifact,
  describeApprovalRecordArtifact,
} from './logic.js';
import type { ApprovalRecordArtifact } from './codec.js';

type ApprovalRecordLogicCase = {
  name: string;
  inputs: {
    artifact: ApprovalRecordArtifact;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { artifact: ApprovalRecordArtifact },
  ) => void;
};

describe('ApprovalRecordArtifact logic', () => {
  const cases = [
    {
      name: 'normalizes approval record artifacts',
      inputs: {
        artifact: {
          id: 'artifact-approval-1',
          artifactType: 'approval-record',
          version: 1,
          summary: ' Approve spec ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            approvalId: ' approval-1 ',
            subjectType: 'spec',
            subjectId: ' spec-1 ',
            actorId: ' operator-1 ',
            decision: 'approved',
            rationale: ' Looks good ',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const artifact = createApprovalRecordArtifact(inputs.artifact);

        expect(artifact.artifactType).toBe('approval-record');
        expect(artifact.summary).toBe('Approve spec');
        expect(artifact.payload).toMatchObject({
          approvalId: 'approval-1',
          subjectId: 'spec-1',
          actorId: 'operator-1',
          rationale: 'Looks good',
        });
        expect(artifact.trace).toContain('artifact:approval-record');
      },
    },
    {
      name: 'describes approval record artifacts',
      inputs: {
        artifact: {
          id: 'artifact-approval-1',
          artifactType: 'approval-record',
          version: 1,
          summary: 'Approve spec',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            approvalId: 'approval-1',
            subjectType: 'spec',
            subjectId: 'spec-1',
            actorId: 'operator-1',
            decision: 'approved',
            rationale: 'Looks good',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const description = describeApprovalRecordArtifact(inputs.artifact);

        expect(description).toContain('approved spec spec-1');
      },
    },
  ] satisfies ApprovalRecordLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
