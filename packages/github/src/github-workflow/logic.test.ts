import { describe, expect, it } from 'vitest';

import {
  createGitHubActionRequest,
  createGitHubIssueSpecLink,
  createGitHubPullRequestState,
  createGitHubRepositoryState,
  createGitHubRestRequest,
  describeGitHubActionRequest,
  describeGitHubPullRequestState,
  isPrivilegedGitHubAction,
} from './logic.js';
import type {
  GitHubActionRequest,
  GitHubIssueSpecLink,
  GitHubPullRequestState,
  GitHubRepositoryState,
} from './types.js';

describe('GitHubActionRequest logic', () => {
  describe('normalizes GitHub action requests and privilege inference', () => {
    const cases = [
      {
        name: 'normalizes privileged merge requests',
        inputs: {
          request: {
            repoFullName: ' VannaDii/devplat ',
            action: 'merge-pr',
            summary: '  Merge the approved slice PR  ',
            privileged: false,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (snapshot: ReturnType<typeof createGitHubActionRequest>) => {
          expect(snapshot.repoFullName).toBe('VannaDii/devplat');
          expect(isPrivilegedGitHubAction(snapshot)).toBe(true);
          expect(describeGitHubActionRequest(snapshot)).toContain('merge-pr');
        },
      },
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(createGitHubActionRequest(testCase.inputs.request));
    });
  });

  describe('treats regular update actions as non-privileged by default', () => {
    const cases = [
      {
        name: 'normalizes non-privileged update requests',
        inputs: {
          request: {
            repoFullName: ' VannaDii/devplat ',
            action: 'update-pr',
            summary: '  Refresh the PR body  ',
            privileged: false,
            branchName: ' feature/refresh ',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (snapshot: ReturnType<typeof createGitHubActionRequest>) => {
          expect(snapshot.branchName).toBe('feature/refresh');
          expect(isPrivilegedGitHubAction(snapshot)).toBe(false);
        },
      },
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(createGitHubActionRequest(testCase.inputs.request));
    });
  });

  describe('maps platform actions to concrete GitHub REST requests', () => {
    const cases = [
      {
        name: 'maps create-pr to the pull request creation endpoint',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open spec PR',
            privileged: false,
            branchName: 'feature/spec',
            baseBranch: 'main',
            title: 'feat: add spec',
            body: 'Spec body',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'POST',
            endpoint: '/repos/VannaDii/devplat/pulls',
            body: {
              title: 'feat: add spec',
              body: 'Spec body',
              head: 'feature/spec',
              base: 'main',
            },
          });
        },
      },
      {
        name: 'maps comment-pr to the issue comments endpoint',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'comment-pr',
            summary: 'Comment',
            privileged: false,
            targetNumber: 42,
            commentBody: 'Review summary',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'POST',
            endpoint: '/repos/VannaDii/devplat/issues/42/comments',
            body: { body: 'Review summary' },
          });
        },
      },
      {
        name: 'uses the request body fallback for comments',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'comment-pr',
            summary: 'Comment summary',
            privileged: false,
            targetNumber: 43,
            body: 'Body fallback',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'POST',
            endpoint: '/repos/VannaDii/devplat/issues/43/comments',
            body: { body: 'Body fallback' },
          });
        },
      },
      {
        name: 'uses the request summary fallback for comments',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'comment-pr',
            summary: 'Summary fallback',
            privileged: false,
            targetNumber: 44,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'POST',
            endpoint: '/repos/VannaDii/devplat/issues/44/comments',
            body: { body: 'Summary fallback' },
          });
        },
      },
      {
        name: 'maps sync-branch with an expected head SHA',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'sync-branch',
            summary: 'Sync branch',
            privileged: false,
            targetNumber: 42,
            expectedHeadSha: 'abc123',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'PUT',
            endpoint: '/repos/VannaDii/devplat/pulls/42/update-branch',
            body: { expected_head_sha: 'abc123' },
          });
        },
      },
      {
        name: 'maps merge-pr with explicit commit text',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'merge-pr',
            summary: 'Merge PR',
            privileged: true,
            targetNumber: 43,
            title: 'Merge title',
            body: 'Merge body',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'PUT',
            endpoint: '/repos/VannaDii/devplat/pulls/43/merge',
            body: {
              commit_title: 'Merge title',
              commit_message: 'Merge body',
            },
          });
        },
      },
      {
        name: 'maps update-pr to the pull request update endpoint',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'update-pr',
            summary: 'Update PR',
            privileged: false,
            targetNumber: 42,
            title: 'Updated title',
            body: 'Updated body',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'PATCH',
            endpoint: '/repos/VannaDii/devplat/pulls/42',
            body: {
              title: 'Updated title',
              body: 'Updated body',
            },
          });
        },
      },
      {
        name: 'maps merge-pr with expected head SHA protection',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'merge-pr',
            summary: 'Merge PR',
            privileged: true,
            targetNumber: 42,
            expectedHeadSha: 'abc123',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'PUT',
            endpoint: '/repos/VannaDii/devplat/pulls/42/merge',
            body: {
              commit_title: 'Merge PR',
              commit_message: 'Merge PR',
              sha: 'abc123',
            },
          });
        },
      },
      {
        name: 'maps sync-branch without an expected head SHA',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'sync-branch',
            summary: 'Sync branch',
            privileged: false,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: ReturnType<typeof createGitHubRestRequest>) => {
          expect(request).toEqual({
            method: 'PUT',
            endpoint: '/repos/VannaDii/devplat/pulls/42/update-branch',
            body: {},
          });
        },
      },
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(createGitHubRestRequest(testCase.inputs.request));
    });
  });

  describe('rejects incomplete GitHub REST action inputs', () => {
    const cases = [
      {
        name: 'rejects create-pr without baseBranch',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            branchName: 'feature/spec',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: GitHubActionRequest) => {
          expect(() => createGitHubRestRequest(request)).toThrow('baseBranch');
        },
      },
      {
        name: 'rejects create-pr without branchName',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            baseBranch: 'main',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: GitHubActionRequest) => {
          expect(() => createGitHubRestRequest(request)).toThrow('branchName');
        },
      },
      {
        name: 'rejects invalid create-pr branch names',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            branchName: 'feature..bad',
            baseBranch: 'main',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: GitHubActionRequest) => {
          expect(() => createGitHubRestRequest(request)).toThrow(
            'Git branch name',
          );
        },
      },
      {
        name: 'rejects pull-request actions without targetNumber',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'update-pr',
            summary: 'Update PR',
            privileged: false,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: GitHubActionRequest) => {
          expect(() => createGitHubRestRequest(request)).toThrow(
            'targetNumber',
          );
        },
      },
      {
        name: 'rejects malformed repository names',
        inputs: {
          request: {
            repoFullName: 'VannaDii',
            action: 'sync-branch',
            summary: 'Sync branch',
            privileged: false,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: GitHubActionRequest) => {
          expect(() => createGitHubRestRequest(request)).toThrow('owner/repo');
        },
      },
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs.request);
    });
  });

  describe('normalizes GitHub repository and pull request state contracts', () => {
    const cases = [
      {
        name: 'normalizes repository and pull request state',
        inputs: {
          repository: {
            repoFullName: ' VannaDii/devplat ',
            defaultBranch: ' main ',
            protectedBranches: [' main ', 'release', 'main'],
            openPullRequestNumbers: [55, 42, 55],
            linkedIssueNumbers: [7, 5, 7],
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
          pullRequest: {
            repoFullName: ' VannaDii/devplat ',
            number: 55,
            title: ' feat: complete runtime ',
            state: 'open',
            headBranch: ' feature/runtime ',
            baseBranch: ' main ',
            headSha: ' abc123 ',
            specId: ' spec-1 ',
            issueNumbers: [7, 5, 7],
            labels: [' autonomy ', 'autonomy', 'platform'],
            checkState: 'pending',
            reviewDecision: 'review-required',
            mergeable: false,
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        },
        mock: () => undefined,
        assert: (inputs: {
          repository: GitHubRepositoryState;
          pullRequest: GitHubPullRequestState;
        }) => {
          const repository = createGitHubRepositoryState(inputs.repository);
          const pullRequest = createGitHubPullRequestState(inputs.pullRequest);

          expect(repository.repoFullName).toBe('VannaDii/devplat');
          expect(repository.protectedBranches).toEqual(['main', 'release']);
          expect(repository.openPullRequestNumbers).toEqual([42, 55]);
          expect(repository.linkedIssueNumbers).toEqual([5, 7]);
          expect(pullRequest.title).toBe('feat: complete runtime');
          expect(pullRequest.headBranch).toBe('feature/runtime');
          expect(pullRequest.labels).toEqual(['autonomy', 'platform']);
          expect(pullRequest.issueNumbers).toEqual([5, 7]);
          expect(describeGitHubPullRequestState(pullRequest)).toContain(
            '#55 open',
          );
        },
      },
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  });

  describe('normalizes issue/spec pull request links', () => {
    const cases = [
      {
        name: 'normalizes issue spec pull request links',
        inputs: {
          link: {
            repoFullName: ' VannaDii/devplat ',
            issueNumber: 7,
            specId: ' spec-1 ',
            pullRequestNumber: 55,
            status: 'in-progress',
            threadId: ' thread-1 ',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        },
        mock: () => undefined,
        assert: (inputs: { link: GitHubIssueSpecLink }) => {
          const link = createGitHubIssueSpecLink(inputs.link);

          expect(link.repoFullName).toBe('VannaDii/devplat');
          expect(link.specId).toBe('spec-1');
          expect(link.threadId).toBe('thread-1');
          expect(link.pullRequestNumber).toBe(55);
        },
      },
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  });
});
