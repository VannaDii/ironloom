import { describe, expect, it } from 'vitest';

import { AuditLogArtifactService } from './service.js';
import type { AuditLogArtifact } from './codec.js';

type AuditLogServiceCase = {
  name: string;
  inputs: {
    artifact: AuditLogArtifact;
  };
  mock: () => {
    service: AuditLogArtifactService;
  };
  assert: (
    context: { service: AuditLogArtifactService },
    inputs: { artifact: AuditLogArtifact },
  ) => void;
};

describe('AuditLogArtifactService', () => {
  const cases = [
    {
      name: 'executes and explains audit log artifacts',
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
        service: new AuditLogArtifactService(),
      }),
      assert: (context, inputs) => {
        const artifact = context.service.execute(inputs.artifact);

        expect(artifact.summary).toBe('Audit event');
        expect(context.service.explain(artifact)).toContain('audit-log');
      },
    },
  ] satisfies AuditLogServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
