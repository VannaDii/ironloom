import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { ArtifactEnvelopeCodec } from './codec.js';

type ArtifactEnvelopeCodecCase = {
  name: string;
  inputs: {
    envelope: unknown;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { envelope: unknown },
  ) => void;
};

describe('ArtifactEnvelopeCodec', () => {
  const cases = [
    {
      name: 'accepts registry-supported artifact types',
      inputs: {
        envelope: {
          id: 'artifact-supported-1',
          artifactType: 'review-finding',
          version: 1,
          summary: 'Review finding',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            findingId: 'finding-1',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = decodeWithCodec(ArtifactEnvelopeCodec, inputs.envelope);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.artifactType).toBe('review-finding');
        }
      },
    },
    {
      name: 'rejects artifact types outside the shared supported vocabulary',
      inputs: {
        envelope: {
          id: 'artifact-unsupported-1',
          artifactType: 'discord-approval',
          version: 1,
          summary: 'Discord approval',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          payload: {
            approvalId: 'approval-1',
          },
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const result = decodeWithCodec(ArtifactEnvelopeCodec, inputs.envelope);

        expect(result.ok).toBe(false);
      },
    },
  ] satisfies ArtifactEnvelopeCodecCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
