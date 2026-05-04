import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { SpecRecordCodec, SpecRevisionCodec } from './codec.js';

describe('spec record codecs', () => {
  const cases = [
    {
      name: 'decode valid spec payloads',
      inputs: {
        decoders: [
          {
            codec: SpecRevisionCodec,
            value: {
              version: 1,
              summary: 'Initial draft.',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: SpecRecordCodec,
            value: {
              specId: 'spec-1',
              researchId: 'research-1',
              title: 'Operator controls',
              objective: 'Define operator controls.',
              acceptanceCriteria: ['Render controls'],
              approvalState: 'review',
              version: 1,
              updatedAt: '2026-04-04T00:00:00.000Z',
              revisionHistory: [
                {
                  version: 1,
                  summary: 'Initial draft.',
                  updatedAt: '2026-04-04T00:00:00.000Z',
                },
              ],
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
      name: 'reject invalid spec timestamps',
      inputs: {
        decoders: [
          {
            codec: SpecRevisionCodec,
            value: {
              version: 1,
              summary: 'Initial draft.',
              updatedAt: 'April 4, 2026',
            },
          },
          {
            codec: SpecRecordCodec,
            value: {
              specId: 'spec-1',
              researchId: 'research-1',
              title: 'Operator controls',
              objective: 'Define operator controls.',
              acceptanceCriteria: ['Render controls'],
              approvalState: 'review',
              version: 1,
              updatedAt: '2026-04-04',
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
