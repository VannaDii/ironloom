import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';
import type { DevplatResult } from '@vannadii/devplat-core';

import {
  GitHubActionRequestCodec,
  GitHubPullRequestStateCodec,
  GitHubRepositoryStateCodec,
} from './codec.js';

describe('GitHub workflow codecs', () => {
  const cases = [
    {
      name: 'decode valid GitHub workflow branch and timestamp contracts',
      inputs: {
        decoders: [
          {
            codec: GitHubActionRequestCodec,
            value: {
              repoFullName: 'VannaDii/devplat',
              action: 'create-pr',
              summary: 'Open a lifecycle PR.',
              privileged: false,
              branchName: 'feature/lifecycle-depth',
              baseBranch: 'main',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: GitHubRepositoryStateCodec,
            value: {
              repoFullName: 'VannaDii/devplat',
              defaultBranch: 'main',
              protectedBranches: ['main', 'release'],
              openPullRequestNumbers: [60],
              linkedIssueNumbers: [12],
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: GitHubPullRequestStateCodec,
            value: {
              repoFullName: 'VannaDii/devplat',
              number: 60,
              title: 'fix: validate lifecycle records',
              state: 'open',
              headBranch: 'feature/lifecycle-depth',
              baseBranch: 'main',
              headSha: 'abc123',
              issueNumbers: [12],
              labels: ['platform'],
              checkState: 'passing',
              reviewDecision: 'approved',
              mergeable: true,
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues: DevplatResult<unknown>[]) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject unsafe GitHub workflow branch and timestamp contracts',
      inputs: {
        decoders: [
          {
            codec: GitHubActionRequestCodec,
            value: {
              repoFullName: 'VannaDii/devplat',
              action: 'create-pr',
              summary: 'Open a lifecycle PR.',
              privileged: false,
              branchName: 'feature..bad',
              baseBranch: 'main',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: GitHubRepositoryStateCodec,
            value: {
              repoFullName: 'VannaDii/devplat',
              defaultBranch: 'main lock',
              protectedBranches: ['main'],
              openPullRequestNumbers: [60],
              linkedIssueNumbers: [12],
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: GitHubPullRequestStateCodec,
            value: {
              repoFullName: 'VannaDii/devplat',
              number: 60,
              title: 'fix: validate lifecycle records',
              state: 'open',
              headBranch: 'feature/lifecycle-depth',
              baseBranch: 'main',
              headSha: 'abc123',
              issueNumbers: [12],
              labels: ['platform'],
              checkState: 'passing',
              reviewDecision: 'approved',
              mergeable: true,
              updatedAt: 'April 4, 2026',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues: DevplatResult<unknown>[]) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const decodedValues = await testCase.mock(testCase.inputs);

    testCase.assert(decodedValues);
  });
});
