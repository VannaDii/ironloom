import { describe, expect, it } from 'vitest';

import {
  createDiscordControlRequestFromInteraction,
  createDiscordControlRequest,
  describeDiscordControlRequest,
} from './logic.js';
import type { DiscordOperatorInteraction } from './types.js';

describe('DiscordControlRequest logic', () => {
  it('keeps actions thread-scoped and auditable', () => {
    const request = createDiscordControlRequest({
      id: 'discord-001',
      summary: '  approve this slice  ',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-1',
      threadId: 'thread-1',
      channelId: 'channel-1',
      action: 'approve-this',
      privileged: true,
    });

    expect(request.summary).toBe('approve this slice');
    expect(request.trace).toContain('discord:thread-1:approve-this');
    expect(describeDiscordControlRequest(request)).toContain(
      'thread-1:approve-this',
    );
  });

  it('rejects control actions that are not scoped to a thread', () => {
    expect(() =>
      createDiscordControlRequest({
        id: 'discord-002',
        summary: 'missing thread',
        status: 'running',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        actorId: 'user-1',
        threadId: ' ',
        channelId: 'channel-1',
        action: 'pause-this',
        privileged: false,
      }),
    ).toThrow('thread');
  });

  it('accepts diagnostic and lifecycle control actions used in daily operation', () => {
    const request = createDiscordControlRequest({
      id: 'discord-003',
      summary: '  show the latest artifact  ',
      status: 'review',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-3',
      threadId: 'thread-3',
      channelId: 'channel-3',
      action: 'show-last-artifact',
      privileged: false,
    });

    expect(request.action).toBe('show-last-artifact');
    expect(request.trace).toContain('discord:thread-3:show-last-artifact');
  });

  it('accepts queue-oriented operator actions for common development flow', () => {
    const request = createDiscordControlRequest({
      id: 'discord-004',
      summary: '  claim this task  ',
      status: 'review',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4',
      threadId: 'thread-4',
      channelId: 'channel-4',
      action: 'claim-this',
      privileged: false,
    });

    expect(request.summary).toBe('claim this task');
    expect(request.trace).toContain('discord:thread-4:claim-this');
  });

  it('routes real operator interactions and fails closed on ambiguity', () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction-001',
            token: 'token-1',
            actorId: 'user-1',
            channelId: 'channel-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'run this',
            threadId: 'thread-1',
            summary: 'Run implementation',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('run-this');
            expect(route.request.threadId).toBe('thread-1');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-002',
            token: 'token-2',
            actorId: 'user-2',
            channelId: 'channel-2',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:merge-now',
            threadId: 'thread-2',
            boundThreadId: 'thread-3',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('exactly one bound thread');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-003',
            token: 'token-3',
            actorId: 'user-3',
            channelId: 'channel-3',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:retry-gates',
            boundThreadId: 'thread-3',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('retry-gates');
            expect(route.request.threadId).toBe('thread-3');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-004',
            token: 'token-4',
            actorId: 'user-4',
            channelId: 'channel-4',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'run this',
            customId: 'devplat:merge-now',
            threadId: 'thread-4',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('not recognized');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-005',
            token: 'token-5',
            actorId: 'user-5',
            channelId: 'channel-5',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('exactly one bound thread');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-006',
            token: 'token-6',
            actorId: 'user-6',
            channelId: 'channel-6',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'devplat:run-this',
            customId: 'run this',
            boundThreadId: 'thread-6',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('run-this');
            expect(route.request.threadId).toBe('thread-6');
          }
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(
        createDiscordControlRequestFromInteraction(testCase.inputs.interaction),
      );
    }
  });
});
