import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  GitHubRestApiTransport,
  GitHubWorkflowService,
  type GitHubRestTransport,
} from './service.js';
import type {
  GitHubActionRequest,
  GitHubIssueSpecLink,
  GitHubPullRequestState,
  GitHubRepositoryState,
  GitHubSubmissionReceipt,
} from './codec.js';

/**
 * Creates a deterministic GitHub transport for service tests.
 */
function createTransport(
  receipt: GitHubSubmissionReceipt,
): GitHubRestTransport {
  return {
    async submit() {
      return receipt;
    },
  };
}

describe('GitHubWorkflowService', () => {
  describe('evaluates policy and records telemetry for GitHub actions', () => {
    const cases = [
      {
        name: 'blocks privileged merge actions without policy approval',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'merge-pr',
            summary: 'Merge the release PR',
            privileged: true,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            resolve(tmpdir(), 'devplat-github-'),
          );
          const store = new FileStoreService(rootDirectory);
          return {
            store,
            service: new GitHubWorkflowService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              createTransport({
                method: 'PUT',
                endpoint: '/repos/VannaDii/devplat/pulls/42/merge',
                statusCode: 200,
                responseBody: { merged: true },
              }),
            ),
          };
        },
        assert: async (
          context: {
            store: FileStoreService;
            service: GitHubWorkflowService;
          },
          inputs: { request: GitHubActionRequest },
        ) => {
          const result = await context.service.submit(inputs.request);
          expect(result.allowed).toBe(false);
          expect(result.submitted).toBe(false);
          expect(
            result.telemetryEventId.startsWith('telemetry:merge-pr:'),
          ).toBe(true);
          expect(await context.store.list('telemetry')).toHaveLength(1);
          expect(context.service.explain(result.request)).toContain(
            'VannaDii/devplat',
          );
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      const context = await testCase.mock();
      await testCase.assert(context, testCase.inputs);
    });
  });

  describe('prepares normal update actions and records nullable metadata', () => {
    const cases = [
      {
        name: 'prepares update-pr requests and records nullable fields',
        inputs: {
          request: {
            repoFullName: ' VannaDii/devplat ',
            action: 'update-pr',
            summary: '  Refresh the PR body  ',
            privileged: false,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            resolve(tmpdir(), 'devplat-github-'),
          );
          const store = new FileStoreService(rootDirectory);
          return {
            service: new GitHubWorkflowService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              createTransport({
                method: 'PATCH',
                endpoint: '/repos/VannaDii/devplat/pulls/42',
                statusCode: 200,
                responseBody: { number: 42 },
              }),
            ),
          };
        },
        assert: async (
          context: { service: GitHubWorkflowService },
          inputs: { request: GitHubActionRequest },
        ) => {
          const prepared = context.service.prepare(inputs.request);
          const result = await context.service.submit(prepared);

          expect(prepared.repoFullName).toBe('VannaDii/devplat');
          expect(result.allowed).toBe(true);
          expect(result.submitted).toBe(true);
          expect(
            result.telemetryEventId.startsWith('telemetry:update-pr:'),
          ).toBe(true);
          expect(result.receipt?.endpoint).toBe(
            '/repos/VannaDii/devplat/pulls/42',
          );
          expect(context.service.explain(prepared)).toContain('update-pr');
        },
      },
      {
        name: 'submits create-pr requests with explicit base branches',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open implementation PR',
            privileged: false,
            branchName: 'feature/implementation',
            baseBranch: 'main',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            resolve(tmpdir(), 'devplat-github-'),
          );
          const store = new FileStoreService(rootDirectory);
          return {
            service: new GitHubWorkflowService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              createTransport({
                method: 'POST',
                endpoint: '/repos/VannaDii/devplat/pulls',
                statusCode: 201,
                responseBody: { number: 43 },
              }),
            ),
          };
        },
        assert: async (
          context: { service: GitHubWorkflowService },
          inputs: { request: GitHubActionRequest },
        ) => {
          const result = await context.service.submit(inputs.request);

          expect(result.allowed).toBe(true);
          expect(result.submitted).toBe(true);
          expect(result.receipt?.statusCode).toBe(201);
        },
      },
      {
        name: 'marks allowed GitHub actions as unsubmitted when GitHub rejects them',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'update-pr',
            summary: 'Refresh the PR body',
            privileged: false,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            resolve(tmpdir(), 'devplat-github-'),
          );
          const store = new FileStoreService(rootDirectory);
          return {
            service: new GitHubWorkflowService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              createTransport({
                method: 'PATCH',
                endpoint: '/repos/VannaDii/devplat/pulls/42',
                statusCode: 422,
                responseBody: { message: 'Validation failed' },
              }),
            ),
          };
        },
        assert: async (
          context: { service: GitHubWorkflowService },
          inputs: { request: GitHubActionRequest },
        ) => {
          const result = await context.service.submit(inputs.request);

          expect(result.allowed).toBe(true);
          expect(result.submitted).toBe(false);
          expect(result.receipt?.statusCode).toBe(422);
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      const context = await testCase.mock();
      await testCase.assert(context, testCase.inputs);
    });
  });

  describe('normalizes repository, pull request, and spec issue state through the service', () => {
    const cases = [
      {
        name: 'normalizes repository, pull request, and issue/spec state',
        inputs: {
          repository: {
            repoFullName: ' VannaDii/devplat ',
            defaultBranch: ' main ',
            protectedBranches: [' main ', 'main'],
            openPullRequestNumbers: [55, 42, 55],
            linkedIssueNumbers: [7],
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
            issueNumbers: [7],
            labels: [' platform ', 'platform'],
            checkState: 'passing',
            reviewDecision: 'approved',
            mergeable: true,
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
          link: {
            repoFullName: ' VannaDii/devplat ',
            issueNumber: 7,
            specId: ' spec-1 ',
            pullRequestNumber: 55,
            status: 'complete',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        },
        mock: () => {
          return {
            service: new GitHubWorkflowService(),
          };
        },
        assert: (
          context: {
            service: GitHubWorkflowService;
          },
          inputs: {
            repository: GitHubRepositoryState;
            pullRequest: GitHubPullRequestState;
            link: GitHubIssueSpecLink;
          },
        ) => {
          const repository = context.service.normalizeRepositoryState(
            inputs.repository,
          );
          const pullRequest = context.service.normalizePullRequestState(
            inputs.pullRequest,
          );
          const link = context.service.linkIssueToSpecPr(inputs.link);

          expect(repository.openPullRequestNumbers).toEqual([42, 55]);
          expect(pullRequest.labels).toEqual(['platform']);
          expect(link.specId).toBe('spec-1');
        },
      },
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      const context = testCase.mock();
      testCase.assert(context, testCase.inputs);
    });
  });

  describe('submits concrete GitHub REST requests with response receipts', () => {
    const cases = [
      {
        name: 'submits create-pr to the concrete REST endpoint',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            branchName: 'feature/pr',
            baseBranch: 'main',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => {
          const calls: string[] = [];
          const fetchImpl = async (url: string): Promise<Response> => {
            calls.push(url);
            return new Response(JSON.stringify({ number: 42 }), {
              status: 201,
            });
          };
          return {
            calls,
            transport: new GitHubRestApiTransport(
              'token-1',
              'https://github.test',
              fetchImpl,
            ),
          };
        },
        assert: async (
          context: {
            calls: string[];
            transport: GitHubRestApiTransport;
          },
          inputs: { request: GitHubActionRequest },
        ) => {
          const receipt = await context.transport.submit(inputs.request);

          expect(receipt.statusCode).toBe(201);
          expect(receipt.endpoint).toBe('/repos/VannaDii/devplat/pulls');
          expect(context.calls).toEqual([
            'https://github.test/repos/VannaDii/devplat/pulls',
          ]);
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      const context = testCase.mock();
      await testCase.assert(context, testCase.inputs);
    });
  });

  describe('requires a token before GitHub REST submission', () => {
    const cases = [
      {
        name: 'rejects live submissions without a token',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            branchName: 'feature/pr',
            baseBranch: 'main',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () =>
          new GitHubRestApiTransport('', 'https://github.test', fetch, 'live'),
        assert: async (
          transport: GitHubRestApiTransport,
          inputs: { request: GitHubActionRequest },
        ) => {
          await expect(transport.submit(inputs.request)).rejects.toThrow(
            'GITHUB_TOKEN',
          );
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      await testCase.assert(testCase.mock(), testCase.inputs);
    });
  });

  describe('handles empty GitHub REST response bodies', () => {
    const cases = [
      {
        name: 'maps empty JSON response bodies to null',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'update-pr',
            summary: 'Update PR',
            privileged: false,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => {
          const fetchImpl = async (): Promise<Response> =>
            new Response('', { status: 200 });
          return new GitHubRestApiTransport(
            'token-1',
            'https://github.test',
            fetchImpl,
            'live',
          );
        },
        assert: async (
          transport: GitHubRestApiTransport,
          inputs: { request: GitHubActionRequest },
        ) => {
          const receipt = await transport.submit(inputs.request);

          expect(receipt.statusCode).toBe(200);
          expect(receipt.responseBody).toBeNull();
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      await testCase.assert(testCase.mock(), testCase.inputs);
    });
  });

  describe('dry-runs GitHub submission when no token is configured', () => {
    const cases = [
      {
        name: 'dry-runs sync-branch with the concrete REST request',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'sync-branch',
            summary: 'Sync branch',
            privileged: false,
            branchName: 'feature/downstream',
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => new GitHubRestApiTransport('', 'https://github.test'),
        assert: async (
          transport: GitHubRestApiTransport,
          inputs: { request: GitHubActionRequest },
        ) => {
          const receipt = await transport.submit(inputs.request);

          expect(receipt.statusCode).toBe(0);
          expect(receipt).toMatchObject({
            method: 'PUT',
            endpoint: '/repos/VannaDii/devplat/pulls/42/update-branch',
            responseBody: {
              dryRun: true,
              request: {
                method: 'PUT',
                endpoint: '/repos/VannaDii/devplat/pulls/42/update-branch',
              },
            },
          });
        },
      },
      {
        name: 'dry-runs update-pr with the concrete REST request',
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'update-pr',
            summary: 'Dry run update',
            privileged: false,
            targetNumber: 42,
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => new GitHubRestApiTransport('', 'https://github.test'),
        assert: async (
          transport: GitHubRestApiTransport,
          inputs: { request: GitHubActionRequest },
        ) => {
          const receipt = await transport.submit(inputs.request);

          expect(receipt.statusCode).toBe(0);
          expect(receipt.responseBody).toEqual({
            dryRun: true,
            request: {
              method: 'PATCH',
              endpoint: '/repos/VannaDii/devplat/pulls/42',
              body: {
                title: 'Dry run update',
                body: 'Dry run update',
              },
            },
          });
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      await testCase.assert(testCase.mock(), testCase.inputs);
    });
  });
});
