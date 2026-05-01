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
  it('normalizes GitHub action requests and privilege inference', () => {
    const cases = [
      {
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

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(createGitHubActionRequest(testCase.inputs.request));
    }
  });

  it('treats regular update actions as non-privileged by default', () => {
    const cases = [
      {
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

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(createGitHubActionRequest(testCase.inputs.request));
    }
  });

  it('maps platform actions to concrete GitHub REST requests', () => {
    const cases = [
      {
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

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(createGitHubRestRequest(testCase.inputs.request));
    }
  });

  it('rejects incomplete GitHub REST action inputs', () => {
    const cases = [
      {
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => undefined,
        assert: (request: GitHubActionRequest) => {
          expect(() => createGitHubRestRequest(request)).toThrow('branchName');
        },
      },
      {
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

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(testCase.inputs.request);
    }
  });

  it('normalizes GitHub repository and pull request state contracts', () => {
    const cases = [
      {
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

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(testCase.inputs);
    }
  });

  it('normalizes issue/spec pull request links', () => {
    const cases = [
      {
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

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(testCase.inputs);
    }
  });
});
