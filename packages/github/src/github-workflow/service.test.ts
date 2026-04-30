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
import type { GitHubActionRequest, GitHubSubmissionReceipt } from './types.js';

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
  it('evaluates policy and records telemetry for GitHub actions', async () => {
    const cases = [
      {
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
        assert: async (context: {
          store: FileStoreService;
          service: GitHubWorkflowService;
        }) => {
          const result = await context.service.submit(cases[0].inputs.request);
          expect(result.allowed).toBe(false);
          expect(result.submitted).toBe(false);
          expect(await context.store.list('telemetry')).toHaveLength(1);
          expect(context.service.explain(result.request)).toContain(
            'VannaDii/devplat',
          );
        },
      },
    ];

    for (const testCase of cases) {
      const context = await testCase.mock();
      await testCase.assert(context);
    }
  });

  it('prepares normal update actions and records nullable metadata', async () => {
    const cases = [
      {
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
        assert: async (context: { service: GitHubWorkflowService }) => {
          const prepared = context.service.prepare(cases[0].inputs.request);
          const result = await context.service.submit(prepared);

          expect(prepared.repoFullName).toBe('VannaDii/devplat');
          expect(result.allowed).toBe(true);
          expect(result.submitted).toBe(true);
          expect(result.receipt?.endpoint).toBe(
            '/repos/VannaDii/devplat/pulls/42',
          );
          expect(context.service.explain(prepared)).toContain('update-pr');
        },
      },
      {
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open implementation PR',
            privileged: false,
            branchName: 'feature/implementation',
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
        assert: async (context: { service: GitHubWorkflowService }) => {
          const result = await context.service.submit(cases[1].inputs.request);

          expect(result.allowed).toBe(true);
          expect(result.submitted).toBe(true);
          expect(result.receipt?.statusCode).toBe(201);
        },
      },
    ];

    for (const testCase of cases) {
      const context = await testCase.mock();
      await testCase.assert(context);
    }
  });

  it('submits concrete GitHub REST requests with response receipts', async () => {
    const cases = [
      {
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            branchName: 'feature/pr',
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
        assert: async (context: {
          calls: string[];
          transport: GitHubRestApiTransport;
        }) => {
          const receipt = await context.transport.submit(
            cases[0].inputs.request,
          );

          expect(receipt.statusCode).toBe(201);
          expect(receipt.endpoint).toBe('/repos/VannaDii/devplat/pulls');
          expect(context.calls).toEqual([
            'https://github.test/repos/VannaDii/devplat/pulls',
          ]);
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context);
    }
  });

  it('requires a token before GitHub REST submission', async () => {
    const cases = [
      {
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'create-pr',
            summary: 'Open PR',
            privileged: false,
            branchName: 'feature/pr',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () =>
          new GitHubRestApiTransport('', 'https://github.test', fetch, 'live'),
        assert: async (transport: GitHubRestApiTransport) => {
          await expect(
            transport.submit(cases[0].inputs.request),
          ).rejects.toThrow('GITHUB_TOKEN');
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock());
    }
  });

  it('handles empty GitHub REST response bodies', async () => {
    const cases = [
      {
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
        assert: async (transport: GitHubRestApiTransport) => {
          const receipt = await transport.submit(cases[0].inputs.request);

          expect(receipt.statusCode).toBe(200);
          expect(receipt.responseBody).toBeNull();
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock());
    }
  });

  it('dry-runs GitHub submission when no token is configured', async () => {
    const cases = [
      {
        inputs: {
          request: {
            repoFullName: 'VannaDii/devplat',
            action: 'sync-branch',
            summary: 'Sync branch',
            privileged: false,
            branchName: 'feature/downstream',
            updatedAt: '2026-04-04T00:00:00.000Z',
          } satisfies GitHubActionRequest,
        },
        mock: () => new GitHubRestApiTransport('', 'https://github.test'),
        assert: async (transport: GitHubRestApiTransport) => {
          const receipt = await transport.submit(cases[0].inputs.request);

          expect(receipt.statusCode).toBe(0);
          expect(receipt.endpoint).toBe('dry-run:sync-branch');
        },
      },
      {
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
        assert: async (transport: GitHubRestApiTransport) => {
          const receipt = await transport.submit(cases[1].inputs.request);

          expect(receipt.statusCode).toBe(0);
          expect(receipt.responseBody).toEqual({
            dryRun: true,
            repoFullName: 'VannaDii/devplat',
            targetNumber: 42,
            branchName: null,
          });
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock());
    }
  });
});
