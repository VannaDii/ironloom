import { describe, expect, it } from 'vitest';

import {
  createArtifactRegistry,
  createDefaultArtifactRegistry,
  type ArtifactRegistry,
} from '../artifact-registry/index.js';
import { ArtifactValidationService } from './service.js';

type ArtifactValidationServiceCase = {
  name: string;
  inputs: {
    artifact: unknown;
  };
  mock: () => {
    registry?: ArtifactRegistry;
    service: ArtifactValidationService;
  };
  assert: (
    context: {
      registry?: ArtifactRegistry;
      service: ArtifactValidationService;
    },
    inputs: { artifact: unknown },
  ) => void;
};

describe('ArtifactValidationService', () => {
  const cases = [
    {
      name: 'executes and explains validated artifacts',
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
            auditId: 'audit-1',
            actorId: 'operator-1',
            action: 'retry-gates',
            scope: 'discord',
            details: {
              threadId: 'thread-1',
            },
          },
        },
      },
      mock: () => ({
        service: new ArtifactValidationService(),
      }),
      assert: (context, inputs) => {
        const result = context.service.execute(inputs.artifact);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(context.service.explain(result.value)).toBe('audit-log@v1');
        }
      },
    },
    {
      name: 'executes with active registry constraints',
      inputs: {
        artifact: {
          id: 'artifact-review-1',
          artifactType: 'review-finding',
          version: 1,
          summary: ' Review finding ',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-1',
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
          service: new ArtifactValidationService(),
        };
      },
      assert: (context, inputs) => {
        const result = context.service.execute(inputs.artifact, {
          registry: context.registry,
        });

        expect(result).toMatchObject({
          ok: false,
          error:
            'Artifact type review-finding is not registered for this repository.',
        });
      },
    },
  ] satisfies ArtifactValidationServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
