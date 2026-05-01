import { describe, expect, it } from 'vitest';

import {
  createDiscordApprovalRequest,
  describeDiscordApprovalRequest,
  mapApprovalActionToPolicyAction,
} from './logic.js';
import type { DiscordApprovalRequest } from './types.js';

type DiscordInteractiveApprovalLogicCase = {
  name: string;
  inputs: {
    request: DiscordApprovalRequest;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: { request: DiscordApprovalRequest },
  ) => void;
};

describe('Discord interactive approval logic', () => {
  const cases = [
    {
      name: 'normalizes approval requests and maps them to policy actions',
      inputs: {
        request: {
          id: 'approval-001',
          summary: '  approve implementation slice  ',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-1',
          channelId: 'channel-1',
          threadId: 'thread-1',
          action: 'approve',
          artifactId: 'artifact-1',
          privileged: true,
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const request = createDiscordApprovalRequest(inputs.request);

        expect(request.trace).toContain('discord:approval:thread-1:approve');
        expect(mapApprovalActionToPolicyAction('approve')).toBe('approve-this');
        expect(mapApprovalActionToPolicyAction('retry')).toBe('retry-gates');
        expect(mapApprovalActionToPolicyAction('merge')).toBe('merge-now');
        expect(mapApprovalActionToPolicyAction('escalate')).toBe(
          'rebase-all-dependents',
        );
        expect(describeDiscordApprovalRequest(request)).toContain(
          'thread-1:approve',
        );
      },
    },
    {
      name: 'rejects approvals that are not tied to a thread artifact',
      inputs: {
        request: {
          id: 'approval-002',
          summary: 'merge',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-2',
          channelId: 'channel-2',
          threadId: 'thread-2',
          action: 'merge',
          artifactId: ' ',
          privileged: true,
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        expect(() => createDiscordApprovalRequest(inputs.request)).toThrow(
          'artifactId',
        );
      },
    },
    {
      name: 'rejects approvals with empty thread or channel scope',
      inputs: {
        request: {
          id: 'approval-003',
          summary: 'retry',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          actorId: 'user-3',
          channelId: ' ',
          threadId: 'thread-3',
          action: 'retry',
          artifactId: 'artifact-3',
          privileged: false,
        },
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        expect(() => createDiscordApprovalRequest(inputs.request)).toThrow(
          'channelId',
        );
      },
    },
  ] satisfies DiscordInteractiveApprovalLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
