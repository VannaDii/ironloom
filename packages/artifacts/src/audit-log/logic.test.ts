import { describe, expect, it } from 'vitest';

import { createAuditLogArtifact, describeAuditLogArtifact } from './logic.js';
import type { AuditLogArtifact } from './codec.js';

type AuditLogLogicCase = {
  name: string;
  inputs: {
    artifact: AuditLogArtifact;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { artifact: AuditLogArtifact },
  ) => void;
};

describe('AuditLogArtifact logic', () => {
  const cases = [
    {
      name: 'normalizes audit log artifacts',
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
            action: ' retry-gates ',
            scope: ' discord ',
            details: {
              threadId: 'thread-1',
            },
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const artifact = createAuditLogArtifact(inputs.artifact);

        expect(artifact.artifactType).toBe('audit-log');
        expect(artifact.payload).toMatchObject({
          auditId: 'audit-1',
          actorId: 'operator-1',
          action: 'retry-gates',
          scope: 'discord',
        });
      },
    },
    {
      name: 'describes audit log artifacts',
      inputs: {
        artifact: {
          id: 'artifact-audit-1',
          artifactType: 'audit-log',
          version: 1,
          summary: 'Audit event',
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
      mock: () => ({}),
      assert: (context, inputs) => {
        const description = describeAuditLogArtifact(inputs.artifact);

        expect(description).toContain('discord:retry-gates');
      },
    },
  ] satisfies AuditLogLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
