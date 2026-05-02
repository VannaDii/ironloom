import { describe, expect, it } from 'vitest';

import { createArtifactEnvelope, describeArtifactEnvelope } from './logic.js';

describe('ArtifactEnvelope logic', () => {
  const cases = [
    {
      name: 'normalizes the summary and appends an artifact trace marker',
      inputs: {
        envelope: {
          id: 'artifact-001',
          artifactType: 'gate-run-report',
          version: 1,
          summary: '  gate run completed  ',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          migration: {
            schemaVersion: 1,
            previousArtifactId: 'artifact-000',
            migratedAt: '2026-04-04T00:01:00.000Z',
          },
          payload: {
            passed: true,
          },
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        envelope: Parameters<typeof createArtifactEnvelope>[0];
      }) => {
        const envelope = createArtifactEnvelope(inputs.envelope);

        expect(envelope.summary).toBe('gate run completed');
        expect(envelope.migration?.previousArtifactId).toBe('artifact-000');
        expect(envelope.trace).toContain('artifact:gate-run-report');
        expect(describeArtifactEnvelope(envelope)).toContain('gate-run-report');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});
