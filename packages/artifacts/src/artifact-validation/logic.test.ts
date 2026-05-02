import { describe, expect, it } from 'vitest';

import { describeValidatedArtifact, validateArtifact } from './logic.js';

type ArtifactValidationLogicCase = {
  name: string;
  inputs: {
    artifact: unknown;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { artifact: unknown },
  ) => void;
};

describe('ArtifactValidation logic', () => {
  const cases = [
    {
      name: 'validates known approval record artifacts',
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
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toMatchObject({
            payload: { approvalId: 'approval-1' },
          });
          expect(describeValidatedArtifact(result.value)).toBe(
            'approval-record@v1',
          );
        }
      },
    },
    {
      name: 'rejects malformed known artifacts',
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
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(false);
      },
    },
    {
      name: 'validates known audit log artifacts',
      inputs: {
        artifact: {
          id: 'artifact-audit-1',
          artifactType: 'audit-log',
          version: 1,
          summary: ' Audit event ',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            auditId: ' audit-1 ',
            actorId: ' operator-1 ',
            action: 'retry-gates',
            scope: 'discord',
            details: {
              threadId: 'thread-1',
            },
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toMatchObject({
            payload: { auditId: 'audit-1' },
          });
          expect(describeValidatedArtifact(result.value)).toBe('audit-log@v1');
        }
      },
    },
    {
      name: 'validates known merge decision artifacts',
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
            blockingFindings: [' finding-1 '],
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toMatchObject({
            payload: { decisionId: 'merge-1' },
          });
          expect(describeValidatedArtifact(result.value)).toBe(
            'merge-decision@v1',
          );
        }
      },
    },
    {
      name: 'rejects malformed audit log artifacts',
      inputs: {
        artifact: {
          id: 'artifact-audit-2',
          artifactType: 'audit-log',
          version: 1,
          summary: 'Audit event',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            auditId: 'audit-2',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(false);
      },
    },
    {
      name: 'rejects malformed merge decision artifacts',
      inputs: {
        artifact: {
          id: 'artifact-merge-2',
          artifactType: 'merge-decision',
          version: 1,
          summary: 'Merge decision',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            decisionId: 'merge-2',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(false);
      },
    },
    {
      name: 'validates known rebase result artifacts',
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
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toMatchObject({
            payload: { resultId: 'rebase-1' },
          });
          expect(describeValidatedArtifact(result.value)).toBe(
            'rebase-result@v1',
          );
        }
      },
    },
    {
      name: 'rejects malformed rebase result artifacts',
      inputs: {
        artifact: {
          id: 'artifact-rebase-2',
          artifactType: 'rebase-result',
          version: 1,
          summary: 'Rebase result',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            resultId: 'rebase-2',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(false);
      },
    },
    {
      name: 'rejects malformed artifact envelopes before dispatch',
      inputs: {
        artifact: {
          artifactType: 'approval-record',
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(false);
      },
    },
    {
      name: 'falls back to the generic artifact envelope for unknown artifact types',
      inputs: {
        artifact: {
          id: 'artifact-generic-1',
          artifactType: 'review-finding',
          version: 1,
          summary: ' Generic artifact ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-1',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.summary).toBe('Generic artifact');
          expect(result.value.trace).toContain('artifact:review-finding');
        }
      },
    },
  ] satisfies ArtifactValidationLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
