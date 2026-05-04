import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { MemoryContextBundleCodec, MemoryEntryCodec } from './codec.js';

describe('memory entry codecs', () => {
  const cases = [
    {
      name: 'decode valid memory lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: MemoryEntryCodec,
            value: {
              memoryId: 'memory-1',
              kind: 'decision',
              subject: 'Use Discord thread binding',
              detail: 'Operators must run actions from bound threads.',
              tags: ['discord', 'policy'],
              status: 'active',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: MemoryContextBundleCodec,
            value: {
              bundleId: 'bundle-1',
              decisions: {
                decisionIds: ['memory-1'],
                rationale: 'Preserves operator context.',
              },
              knownTraps: {
                trapIds: ['trap-1'],
                mitigation: 'Fail closed on ambiguous context.',
              },
              reusableContext: ['Thread context is required.'],
              sourceMemoryIds: ['memory-1'],
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject invalid memory lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: MemoryEntryCodec,
            value: {
              memoryId: 'memory-1',
              kind: 'decision',
              subject: 'Use Discord thread binding',
              detail: 'Operators must run actions from bound threads.',
              tags: ['discord', 'policy'],
              status: 'active',
              updatedAt: '2026-04-04',
            },
          },
          {
            codec: MemoryContextBundleCodec,
            value: {
              bundleId: 'bundle-1',
              decisions: {
                decisionIds: ['memory-1'],
                rationale: 'Preserves operator context.',
              },
              knownTraps: {
                trapIds: ['trap-1'],
                mitigation: 'Fail closed on ambiguous context.',
              },
              reusableContext: ['Thread context is required.'],
              sourceMemoryIds: ['memory-1'],
              updatedAt: 'April 4, 2026',
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
