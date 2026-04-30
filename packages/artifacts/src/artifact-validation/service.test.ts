import { describe, expect, it } from 'vitest';

import { ArtifactValidationService } from './service.js';

type ArtifactValidationServiceCase = {
  name: string;
  inputs: {
    artifact: unknown;
  };
  mock: () => {
    service: ArtifactValidationService;
  };
  assert: (
    context: { service: ArtifactValidationService },
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
  ] satisfies ArtifactValidationServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
