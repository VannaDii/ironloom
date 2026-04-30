import { describe, expect, it } from 'vitest';

import { ApprovalRecordArtifactService } from './service.js';
import type { ApprovalRecordArtifact } from './types.js';

type ApprovalRecordServiceCase = {
  name: string;
  inputs: {
    artifact: ApprovalRecordArtifact;
  };
  mock: () => {
    service: ApprovalRecordArtifactService;
  };
  assert: (
    context: { service: ApprovalRecordArtifactService },
    inputs: { artifact: ApprovalRecordArtifact },
  ) => void;
};

describe('ApprovalRecordArtifactService', () => {
  const cases = [
    {
      name: 'executes and explains approval record artifacts',
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
            approvalId: 'approval-1',
            subjectType: 'spec',
            subjectId: 'spec-1',
            actorId: 'operator-1',
            decision: 'approved',
            rationale: 'Looks good',
          },
        },
      },
      mock: () => ({
        service: new ApprovalRecordArtifactService(),
      }),
      assert: (context, inputs) => {
        const artifact = context.service.execute(inputs.artifact);

        expect(artifact.summary).toBe('Approve spec');
        expect(context.service.explain(artifact)).toContain('approval-record');
      },
    },
  ] satisfies ApprovalRecordServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
