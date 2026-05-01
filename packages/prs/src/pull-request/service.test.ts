import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GitHubWorkflowService } from '@vannadii/devplat-github';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import { PullRequestService } from './service.js';
import type { PullRequestRecord } from './types.js';

type PullRequestServiceInputs =
  | {
      mode: 'submit-update';
      record: PullRequestRecord;
    }
  | {
      mode: 'direct';
      record: PullRequestRecord;
    }
  | {
      mode: 'submit-merge';
      record: PullRequestRecord;
    };

type PullRequestServiceContext = {
  rootDirectory: string;
  service: PullRequestService;
};

type PullRequestServiceCase = {
  name: string;
  inputs: PullRequestServiceInputs;
  mock: () => Promise<PullRequestServiceContext>;
  assert: (
    context: PullRequestServiceContext,
    inputs: PullRequestServiceInputs,
  ) => Promise<void> | void;
};

async function createService(): Promise<PullRequestServiceContext> {
  const rootDirectory = await mkdtemp(resolve(tmpdir(), 'devplat-prs-'));
  const github = new GitHubWorkflowService(
    new DecisionPolicyService(),
    new TelemetryEventService(new FileStoreService(rootDirectory)),
  );

  return {
    rootDirectory,
    service: new PullRequestService(github),
  };
}

describe('PullRequestService', () => {
  const cases = [
    {
      name: 'submits PR updates through the GitHub workflow service',
      inputs: {
        mode: 'submit-update',
        record: {
          prNumber: 42,
          branchName: 'feature/release-flow',
          baseBranch: 'main',
          title: 'Release workflow hardening',
          labels: ['release'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: createService,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'submit-update') {
          throw new Error('expected submit-update inputs');
        }

        const result = await context.service.submitUpdate(inputs.record);

        expect(result.request.action).toBe('update-pr');
        expect(result.request.body).toContain('## Status');
        expect(
          await new FileStoreService(context.rootDirectory).list('telemetry'),
        ).toHaveLength(1);
        expect(
          context.service.explain(context.service.create(inputs.record)),
        ).toContain('PR #42');
      },
    },
    {
      name: 'covers create and execute helpers for non-merge-ready records',
      inputs: {
        mode: 'direct',
        record: {
          prNumber: 7,
          branchName: ' feature/wip ',
          baseBranch: ' main ',
          title: '  Work in progress  ',
          labels: ['wip'],
          reviewState: 'review',
          mergeReady: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: createService,
      assert: (context, inputs) => {
        if (inputs.mode !== 'direct') {
          throw new Error('expected direct inputs');
        }

        const created = context.service.create(inputs.record);
        const executed = context.service.execute(created);

        expect(created.branchName).toBe('feature/wip');
        expect(executed.title).toBe('Work in progress');
      },
    },
    {
      name: 'submits explicit merge requests through the GitHub workflow service',
      inputs: {
        mode: 'submit-merge',
        record: {
          prNumber: 52,
          branchName: 'feature/merge-ready',
          baseBranch: 'main',
          title: 'Merge-ready automation',
          labels: ['merge'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: createService,
      assert: async (context, inputs) => {
        if (inputs.mode !== 'submit-merge') {
          throw new Error('expected submit-merge inputs');
        }

        const result = await context.service.submitMerge(inputs.record);

        expect(result.request.action).toBe('merge-pr');
        expect(result.request.body).toContain('## Checklist');
      },
    },
  ] satisfies PullRequestServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      expect.hasAssertions();
      const context = await testCase.mock();

      await testCase.assert(context, testCase.inputs);
    });
  }
});
