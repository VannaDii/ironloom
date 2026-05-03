import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  AllocateWorktreeToolInputCodec,
  CreateResearchBriefToolInputCodec,
  EvaluateSonarQualityGateToolInputCodec,
  ExecuteRebaseDependentsToolInputCodec,
  ReleaseWorktreeToolInputCodec,
  RunGatesToolInputCodec,
  RunSupervisorStepToolInputCodec,
  SubmitPullRequestMergeToolInputCodec,
  SyncWorktreeToolInputCodec,
  UpdateSpecRecordToolInputCodec,
} from './codec.js';

describe('tool surface codecs', () => {
  const cases = [
    {
      name: 'decode valid tool inputs',
      inputs: {
        decoders: [
          {
            codec: CreateResearchBriefToolInputCodec,
            value: {
              researchId: 'research-1',
              topic: 'Discord-first workflows',
              question: 'What should Phase 0 expose?',
              constraints: ['auditability'],
              findings: ['thread isolation'],
              recommendation: 'Expose thread-aware tools.',
              sourceUrls: ['https://example.com/openclaw'],
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: UpdateSpecRecordToolInputCodec,
            value: {
              specId: 'spec-1',
              researchId: 'research-1',
              title: 'Discord approval flow',
              objective: 'Add explicit approval routing.',
              acceptanceCriteria: ['policy check', 'audit artifact'],
              approvalState: 'approved',
              version: 2,
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
          {
            codec: AllocateWorktreeToolInputCodec,
            value: {
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              baseBranch: 'main',
              applyToDisk: true,
            },
          },
          {
            codec: SyncWorktreeToolInputCodec,
            value: {
              allocation: {
                id: 'worktree-1',
                summary: 'Allocate a worktree.',
                status: 'queued',
                trace: [],
                updatedAt: '2026-04-04T00:00:00.000Z',
                taskId: 'task-1',
                branchName: 'feature/thread-aware',
                worktreePath: '/var/devplat/worktree-1',
              },
              baseBranch: 'main',
              syncMode: 'rebase',
              applyToDisk: true,
            },
          },
          {
            codec: ReleaseWorktreeToolInputCodec,
            value: {
              allocation: {
                id: 'worktree-1',
                summary: 'Allocate a worktree.',
                status: 'queued',
                trace: [],
                updatedAt: '2026-04-04T00:00:00.000Z',
                taskId: 'task-1',
                branchName: 'feature/thread-aware',
                worktreePath: '/var/devplat/worktree-1',
              },
              releaseMode: 'archive',
              applyToDisk: true,
            },
          },
          {
            codec: RunGatesToolInputCodec,
            value: {
              gateNames: ['lint'],
              summary: 'Run lint gate.',
              actorId: 'operator-1',
            },
          },
          {
            codec: EvaluateSonarQualityGateToolInputCodec,
            value: {
              projectKey: 'vannadii_devplat',
              overallCoverage: 95,
              newCodeCoverage: 95,
              blockingIssues: 0,
              actorId: 'operator-1',
            },
          },
          {
            codec: SubmitPullRequestMergeToolInputCodec,
            value: {
              record: {
                prNumber: 12,
                branchName: 'feat/operator-surface-hardening',
                baseBranch: 'main',
                title: 'feat: harden operator flows and release guardrails',
                labels: ['operator', 'openclaw'],
                reviewState: 'approved',
                mergeReady: true,
                updatedAt: '2026-04-04T00:00:00.000Z',
              },
              actorId: 'operator-1',
            },
          },
          {
            codec: ExecuteRebaseDependentsToolInputCodec,
            value: {
              record: {
                prNumber: 12,
                branchName: 'feat/operator-surface-hardening',
                baseBranch: 'main',
                title: 'feat: harden operator flows and release guardrails',
                labels: ['operator', 'openclaw'],
                reviewState: 'approved',
                mergeReady: true,
                updatedAt: '2026-04-04T00:00:00.000Z',
              },
              dependentBranches: ['feat/follow-up'],
              syncMode: 'rebase',
            },
          },
          {
            codec: RunSupervisorStepToolInputCodec,
            value: {
              action: 'retry-gates',
              actorId: 'operator-1',
              privileged: true,
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
      name: 'normalize safe git-backed worktree base branches',
      inputs: {
        allocateInput: {
          taskId: 'task-1',
          branchName: 'feature/thread-aware',
          baseBranch: ' main ',
          applyToDisk: true,
        },
        syncInput: {
          allocation: {
            id: 'worktree-1',
            summary: 'Allocate a worktree.',
            status: 'queued',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            taskId: 'task-1',
            branchName: 'feature/thread-aware',
            worktreePath: '/var/devplat/worktree-1',
          },
          baseBranch: ' release/next ',
          syncMode: 'rebase',
          applyToDisk: true,
        },
      },
      mock: async ({ allocateInput, syncInput }) => ({
        allocateResult: decodeWithCodec(
          AllocateWorktreeToolInputCodec,
          allocateInput,
        ),
        syncResult: decodeWithCodec(SyncWorktreeToolInputCodec, syncInput),
      }),
      assert: ({ allocateResult, syncResult }) => {
        expect(allocateResult.ok).toBe(true);
        expect(syncResult.ok).toBe(true);
        if (!allocateResult.ok || !syncResult.ok) {
          return;
        }

        expect(allocateResult.value.baseBranch).toBe('main');
        expect(syncResult.value.baseBranch).toBe('release/next');
      },
    },
    {
      name: 'reject invalid tool inputs',
      inputs: {
        decoders: [
          {
            codec: ReleaseWorktreeToolInputCodec,
            value: {
              releaseMode: 'archive',
            },
          },
          {
            codec: RunSupervisorStepToolInputCodec,
            value: {
              action: 'retry-gates',
              actorId: 1,
              privileged: true,
            },
          },
          {
            codec: AllocateWorktreeToolInputCodec,
            value: {
              taskId: 'task-1',
              branchName: 'feature/thread-aware',
              baseBranch: '--upload-pack=sh',
              applyToDisk: true,
            },
          },
          {
            codec: SyncWorktreeToolInputCodec,
            value: {
              allocation: {
                id: 'worktree-1',
                summary: 'Allocate a worktree.',
                status: 'queued',
                trace: [],
                updatedAt: '2026-04-04T00:00:00.000Z',
                taskId: 'task-1',
                branchName: 'feature/thread-aware',
                worktreePath: '/var/devplat/worktree-1',
              },
              baseBranch: 'invalid branch',
              syncMode: 'rebase',
              applyToDisk: true,
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
