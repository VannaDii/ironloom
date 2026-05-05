import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  WorktreeAllocationCodec,
  WorktreeReleaseModeCodec,
  WorktreeReleaseResultCodec,
  WorktreeSyncModeCodec,
  WorktreeSyncResultCodec,
} from './codec.js';

describe('worktree allocation codecs', () => {
  const cases = [
    {
      name: 'decode valid worktree payloads',
      inputs: {
        decoders: [
          {
            codec: WorktreeSyncModeCodec,
            value: 'rebase',
          },
          {
            codec: WorktreeReleaseModeCodec,
            value: 'archive',
          },
          {
            codec: WorktreeAllocationCodec,
            value: {
              id: 'worktree-1',
              summary: 'Allocate a worktree.',
              status: 'queued',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              worktreePath: '/var/devplat/worktree-1',
            },
          },
          {
            codec: WorktreeSyncResultCodec,
            value: {
              id: 'worktree-1',
              summary: 'Sync a worktree.',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              worktreePath: '/var/devplat/worktree-1',
              baseBranch: 'main',
              syncMode: 'rebase',
              changed: true,
              conflictsDetected: false,
            },
          },
          {
            codec: WorktreeReleaseResultCodec,
            value: {
              id: 'worktree-1',
              summary: 'Release a worktree.',
              status: 'complete',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              worktreePath: '/var/devplat/worktree-1',
              releaseMode: 'delete',
              released: true,
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
      name: 'reject invalid worktree payloads',
      inputs: {
        decoders: [
          {
            codec: WorktreeSyncModeCodec,
            value: 'merge',
          },
          {
            codec: WorktreeReleaseResultCodec,
            value: {
              id: 'worktree-1',
            },
          },
          {
            codec: WorktreeAllocationCodec,
            value: {
              id: 'worktree-1',
              summary: 'Allocate a worktree.',
              status: 'queued',
              trace: [],
              updatedAt: 'April 4, 2026',
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              worktreePath: '/var/devplat/worktree-1',
            },
          },
          {
            codec: WorktreeSyncResultCodec,
            value: {
              id: 'worktree-1',
              summary: 'Sync a worktree.',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              worktreePath: '/var/devplat/worktree-1',
              baseBranch: 'bad branch',
              syncMode: 'rebase',
              changed: true,
              conflictsDetected: false,
            },
          },
          {
            codec: WorktreeReleaseResultCodec,
            value: {
              id: 'worktree-1',
              summary: 'Release a worktree.',
              status: 'complete',
              trace: [],
              updatedAt: '2026-04-04',
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              worktreePath: '/var/devplat/worktree-1',
              releaseMode: 'delete',
              released: true,
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
