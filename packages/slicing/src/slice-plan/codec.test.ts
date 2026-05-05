import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  SliceDependencyGraphCodec,
  SlicePlanCodec,
  SliceWorkPacketCodec,
} from './codec.js';

describe('slice plan codecs', () => {
  const cases = [
    {
      name: 'decode valid slice timestamps and branch refs',
      inputs: {
        decoders: [
          {
            codec: SliceDependencyGraphCodec,
            value: {
              sliceId: 'slice-1',
              graphId: 'graph-1',
              generatedAt: '2026-04-04T00:00:00.000Z',
              edges: [],
              blockedBy: [],
              dependencyCount: 0,
            },
          },
          {
            codec: SliceWorkPacketCodec,
            value: {
              packetId: 'packet-1',
              branchName: ' feature/slice-1 ',
              taskIds: ['task-1'],
              estimatedTaskCount: 1,
              estimatedPullRequestCount: 1,
              pullRequestTitle: 'feat: deliver slice',
              reviewFocus: ['Slice contract.'],
            },
          },
          {
            codec: SlicePlanCodec,
            value: {
              sliceId: 'slice-1',
              specId: 'spec-1',
              title: 'Deliver slice',
              dependsOn: [],
              acceptanceCriteria: ['Pass review.'],
              doneConditions: ['Merged.'],
              size: 'small',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
        expect(decodedValues[1]).toMatchObject({
          value: {
            branchName: 'feature/slice-1',
          },
        });
      },
    },
    {
      name: 'reject invalid slice timestamps and branch refs',
      inputs: {
        decoders: [
          {
            codec: SliceDependencyGraphCodec,
            value: {
              sliceId: 'slice-1',
              graphId: 'graph-1',
              generatedAt: '2026-04-04',
              edges: [],
              blockedBy: [],
              dependencyCount: 0,
            },
          },
          {
            codec: SliceWorkPacketCodec,
            value: {
              packetId: 'packet-1',
              branchName: '-unsafe',
              taskIds: ['task-1'],
              estimatedTaskCount: 1,
              estimatedPullRequestCount: 1,
              pullRequestTitle: 'feat: deliver slice',
              reviewFocus: ['Slice contract.'],
            },
          },
          {
            codec: SlicePlanCodec,
            value: {
              sliceId: 'slice-1',
              specId: 'spec-1',
              title: 'Deliver slice',
              dependsOn: [],
              acceptanceCriteria: ['Pass review.'],
              doneConditions: ['Merged.'],
              size: 'small',
              updatedAt: 'not-a-date',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
