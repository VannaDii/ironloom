import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { PullRequestRecordCodec } from './codec.js';

describe('pull request codecs', () => {
  const cases = [
    {
      name: 'decodes valid pull request records with normalized branch refs',
      inputs: {
        record: {
          prNumber: 42,
          branchName: ' feature/pr-contracts ',
          baseBranch: ' main ',
          title: 'feat: tighten PR contracts',
          labels: ['contracts'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: ({ record }: { record: unknown }) =>
        decodeWithCodec(PullRequestRecordCodec, record),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded).toMatchObject({
          ok: true,
          value: {
            branchName: 'feature/pr-contracts',
            baseBranch: 'main',
          },
        });
      },
    },
    {
      name: 'rejects unsafe branch refs and non-ISO timestamps',
      inputs: {
        record: {
          prNumber: 42,
          branchName: '-flag-like-branch',
          baseBranch: 'main branch',
          title: 'feat: reject unsafe PR refs',
          labels: ['contracts'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: 'not-a-date',
        },
      },
      mock: ({ record }: { record: unknown }) =>
        decodeWithCodec(PullRequestRecordCodec, record),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const decoded = testCase.mock(testCase.inputs);

    testCase.assert(decoded);
  });
});
