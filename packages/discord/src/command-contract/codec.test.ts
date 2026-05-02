import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { DiscordCommandContractRegistryCodec } from './codec.js';

describe('Discord command contract codec', () => {
  const cases = [
    {
      name: 'decodes a command registry for Discord guild registration',
      inputs: {
        value: {
          version: 1,
          contracts: [
            {
              name: 'retry-gates',
              description: 'Retry gates for this thread.',
              type: 1,
              action: 'retry-gates',
              privileged: false,
            },
          ],
        },
      },
      mock: async ({ value }) =>
        decodeWithCodec(DiscordCommandContractRegistryCodec, value),
      assert: (decoded) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'rejects command registries with unknown lifecycle actions',
      inputs: {
        value: {
          version: 1,
          contracts: [
            {
              name: 'deploy-now',
              description: 'Deploy now.',
              type: 1,
              action: 'deploy-now',
              privileged: true,
            },
          ],
        },
      },
      mock: async ({ value }) =>
        decodeWithCodec(DiscordCommandContractRegistryCodec, value),
      assert: (decoded) => {
        expect(decoded.ok).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);

    testCase.assert(outcome);
  });
});
