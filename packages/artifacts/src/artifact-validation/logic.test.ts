import { describe, expect, it } from 'vitest';

import {
  createArtifactRegistry,
  createDefaultArtifactRegistry,
  type ArtifactRegistry,
} from '../artifact-registry/index.js';
import { ARTIFACT_VALIDATION_MIGRATION_REQUIRED_ERROR_CODE } from './constants.js';
import { describeValidatedArtifact, validateArtifact } from './logic.js';

type ArtifactValidationLogicCase = {
  name: string;
  inputs: {
    artifact: unknown;
  };
  mock: () => {
    registry?: ArtifactRegistry;
  };
  assert: (
    context: { registry?: ArtifactRegistry },
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
      name: 'falls back to the generic artifact envelope for registry-supported artifact types without local payload codecs',
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
    {
      name: 'rejects unsupported artifact types before generic envelope normalization',
      inputs: {
        artifact: {
          id: 'artifact-unknown-1',
          artifactType: 'unknown-artifact',
          version: 1,
          summary: ' Unknown artifact ',
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

        expect(result.ok).toBe(false);
      },
    },
    {
      name: 'rejects registry-supported artifact envelopes missing from the active registry',
      inputs: {
        artifact: {
          id: 'artifact-generic-2',
          artifactType: 'review-finding',
          version: 1,
          summary: ' Generic artifact ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-2',
          },
        },
      },
      mock: () => {
        const defaultRegistry = createDefaultArtifactRegistry('repo-main');

        return {
          registry: createArtifactRegistry({
            ...defaultRegistry,
            entries: defaultRegistry.entries.filter(
              (entry) => entry.artifactType !== 'review-finding',
            ),
          }),
        };
      },
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact, {
          registry: context.registry,
        });

        expect(result).toMatchObject({
          ok: false,
          error:
            'Artifact type review-finding is not registered for this repository.',
        });
      },
    },
    {
      name: 'rejects stale artifact versions when registry migration is required',
      inputs: {
        artifact: {
          id: 'artifact-generic-3',
          artifactType: 'review-finding',
          version: 1,
          summary: ' Generic artifact ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-3',
          },
        },
      },
      mock: () => {
        const defaultRegistry = createDefaultArtifactRegistry('repo-main');

        return {
          registry: {
            ...defaultRegistry,
            entries: defaultRegistry.entries.map((entry) =>
              entry.artifactType === 'review-finding'
                ? {
                    ...entry,
                    currentVersion: 2,
                    migrationPolicy: 'required',
                  }
                : entry,
            ),
          },
        };
      },
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact, {
          registry: context.registry,
        });

        expect(result).toMatchObject({
          ok: false,
          error:
            'Artifact review-finding@v1 requires migration to v2 before validation.',
        });
      },
    },
    {
      name: 'reports the applicable migration id for required stale artifacts',
      inputs: {
        artifact: {
          id: 'artifact-generic-3b',
          artifactType: 'review-finding',
          version: 1,
          summary: ' Generic artifact ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-3b',
          },
        },
      },
      mock: () => {
        const defaultRegistry = createDefaultArtifactRegistry('repo-main');

        return {
          registry: createArtifactRegistry({
            ...defaultRegistry,
            entries: defaultRegistry.entries.map((entry) =>
              entry.artifactType === 'review-finding'
                ? {
                    ...entry,
                    currentVersion: 2,
                    migrationPolicy: 'required',
                  }
                : entry,
            ),
            migrations: [
              {
                migrationId: 'review-finding-1-to-2',
                artifactType: 'review-finding',
                fromVersion: 1,
                toVersion: 2,
                summary: 'Migrate review findings to the v2 evidence shape.',
                migratedAt: '2026-04-30T00:00:00.000Z',
              },
            ],
          }),
        };
      },
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact, {
          registry: context.registry,
        });

        expect(result).toMatchObject({
          ok: false,
          error:
            'Artifact review-finding@v1 requires migration review-finding-1-to-2 to v2 before validation.',
          diagnostic: {
            code: ARTIFACT_VALIDATION_MIGRATION_REQUIRED_ERROR_CODE,
            details: {
              migrationId: 'review-finding-1-to-2',
            },
          },
        });
      },
    },
    {
      name: 'accepts stale artifact versions when registry migration is optional',
      inputs: {
        artifact: {
          id: 'artifact-generic-4',
          artifactType: 'review-finding',
          version: 1,
          summary: ' Generic artifact ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-4',
          },
        },
      },
      mock: () => {
        const defaultRegistry = createDefaultArtifactRegistry('repo-main');

        return {
          registry: {
            ...defaultRegistry,
            entries: defaultRegistry.entries.map((entry) =>
              entry.artifactType === 'review-finding'
                ? {
                    ...entry,
                    currentVersion: 2,
                    migrationPolicy: 'optional',
                  }
                : entry,
            ),
          },
        };
      },
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact, {
          registry: context.registry,
        });

        expect(result).toMatchObject({
          ok: true,
          value: {
            artifactType: 'review-finding',
            version: 1,
          },
        });
      },
    },
    {
      name: 'rejects artifact versions newer than the active registry',
      inputs: {
        artifact: {
          id: 'artifact-generic-5',
          artifactType: 'review-finding',
          version: 1,
          summary: ' Generic artifact ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-5',
          },
        },
      },
      mock: () => {
        const defaultRegistry = createDefaultArtifactRegistry('repo-main');

        return {
          registry: {
            ...defaultRegistry,
            entries: defaultRegistry.entries.map((entry) =>
              entry.artifactType === 'review-finding'
                ? {
                    ...entry,
                    currentVersion: 0,
                  }
                : entry,
            ),
          },
        };
      },
      assert: (context, inputs) => {
        const result = validateArtifact(inputs.artifact, {
          registry: context.registry,
        });

        expect(result).toMatchObject({
          ok: false,
          error: 'Artifact review-finding@v1 is newer than registered v0.',
        });
      },
    },
  ] satisfies ArtifactValidationLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
