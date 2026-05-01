import { describe, expect, it } from 'vitest';

import { ArtifactEnvelopeService } from './service.js';

describe('ArtifactEnvelopeService', () => {
  const cases = [
    {
      name: 'delegates to the unit logic',
      inputs: {
        envelope: {
          id: 'artifact-001',
          artifactType: 'review-findings',
          version: 1,
          summary: 'review complete',
          status: 'complete',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingCount: 0,
          },
        },
      },
      mock: () => new ArtifactEnvelopeService(),
      assert: (
        service: ArtifactEnvelopeService,
        inputs: { envelope: Parameters<ArtifactEnvelopeService['execute']>[0] },
      ) => {
        const envelope = service.execute(inputs.envelope);

        expect(envelope.trace).toContain('artifact:review-findings');
        expect(service.explain(envelope)).toContain('review-findings');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.assert(testCase.mock(), testCase.inputs);
  });
});
