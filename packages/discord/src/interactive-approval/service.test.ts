import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArtifactEnvelopeService } from '@vannadii/devplat-artifacts';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import { DiscordInteractiveApprovalService } from './service.js';
import type { DiscordApprovalRequest } from './types.js';

type DiscordInteractiveApprovalServiceContext = {
  service: DiscordInteractiveApprovalService;
  store: FileStoreService;
};

type DiscordInteractiveApprovalServiceCase = {
  name: string;
  inputs: {
    mode: 'handle' | 'execute-and-handle';
    request: DiscordApprovalRequest;
  };
  mock: () => Promise<DiscordInteractiveApprovalServiceContext>;
  assert: (
    context: DiscordInteractiveApprovalServiceContext,
    inputs: {
      mode: 'handle' | 'execute-and-handle';
      request: DiscordApprovalRequest;
    },
  ) => Promise<void>;
};

async function createService(): Promise<DiscordInteractiveApprovalServiceContext> {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
  const store = new FileStoreService(rootDirectory);

  return {
    service: new DiscordInteractiveApprovalService(
      new DecisionPolicyService(),
      new ArtifactEnvelopeService(),
      new TelemetryEventService(store),
      store,
    ),
    store,
  };
}

describe('DiscordInteractiveApprovalService', () => {
  const cases = [
    {
      name: 'records explicit approval artifacts and blocks privileged merges',
      inputs: {
        mode: 'handle',
        request: {
          id: 'approval-001',
          summary: 'Merge slice after approval',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'operator-1',
          channelId: 'channel-1',
          threadId: 'thread-1',
          action: 'merge',
          artifactId: 'artifact-1',
          privileged: true,
        },
      },
      mock: createService,
      assert: async (context, inputs) => {
        const result = await context.service.handleApproval(inputs.request);

        expect(result.allowed).toBe(false);
        expect(result.artifactId).toBe('approval-001:artifact');
        expect(await context.store.list('artifacts')).toContain(
          'approval-001:artifact',
        );
      },
    },
    {
      name: 'allows retry approvals and exposes explain helper output',
      inputs: {
        mode: 'execute-and-handle',
        request: {
          id: 'approval-002',
          summary: '  Retry gates  ',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'operator-2',
          channelId: 'channel-2',
          threadId: 'thread-2',
          action: 'retry',
          artifactId: 'artifact-2',
          privileged: false,
        },
      },
      mock: createService,
      assert: async (context, inputs) => {
        const request = context.service.execute(inputs.request);
        const result = await context.service.handleApproval(request);

        expect(context.service.explain(request)).toContain('thread-2:retry');
        expect(result.allowed).toBe(true);
        expect(await context.store.list('state')).toContain('approval-002');
      },
    },
  ] satisfies DiscordInteractiveApprovalServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      expect.hasAssertions();
      const context = await testCase.mock();

      await testCase.assert(context, testCase.inputs);
    });
  }
});
