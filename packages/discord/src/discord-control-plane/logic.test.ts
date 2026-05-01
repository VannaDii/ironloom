import { describe, expect, it } from 'vitest';

import {
  createDiscordOperatorInteractionFromCallback,
  createDiscordControlRequestFromInteraction,
  createDiscordControlRequest,
  createDiscordWorkItemBinding,
  describeDiscordWorkItemBinding,
  describeDiscordControlRequest,
} from './logic.js';
import type {
  DiscordInteractionCallback,
  DiscordOperatorInteraction,
  DiscordWorkItemBinding,
} from './types.js';
import type { DiscordThreadSession } from '../thread-session/types.js';

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
      {
        inputs: {
          interaction: {
            id: 'interaction-007',
            token: 'token-7',
            actorId: 'user-7',
            channelId: 'channel-7',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'rebase-dependents',
            boundThreadId: 'thread-7',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('rebase-all-dependents');
            expect(route.request.threadId).toBe('thread-7');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008',
            token: 'token-8',
            actorId: 'user-8',
            channelId: 'channel-8',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'deploy-now',
            boundThreadId: 'thread-8',
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
            id: 'interaction-009',
            token: 'token-9',
            actorId: 'user-9',
            channelId: 'channel-9',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            boundSession: {
              id: 'thread-session-009',
              summary: 'Implementation session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-9',
              channelId: 'thread-9',
              parentChannelId: 'implementation-channel',
              threadId: 'thread-9',
              kind: 'implementation',
              specId: 'spec-9',
              sliceId: 'slice-9',
              pullRequestNumber: null,
              artifactId: 'artifact-9',
            },
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.threadId).toBe('thread-9');
            expect(route.request.workItem).toMatchObject({
              threadKind: 'implementation',
              threadId: 'thread-9',
              specId: 'spec-9',
              sliceId: 'slice-9',
              artifactId: 'artifact-9',
            });
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010',
            token: 'token-10',
            actorId: 'user-10',
            channelId: 'channel-10',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-10',
            boundSession: {
              id: 'thread-session-010',
              summary: 'Pull request session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-10',
              channelId: 'thread-11',
              parentChannelId: 'pull-request-channel',
              threadId: 'thread-11',
              kind: 'pull-request',
              specId: 'spec-10',
              sliceId: 'slice-10',
              pullRequestNumber: 10,
              artifactId: 'artifact-10',
            },
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
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(
        createDiscordControlRequestFromInteraction(testCase.inputs.interaction),
      );
    }
  });

  it('normalizes raw Discord interaction callbacks for slash commands and buttons', () => {
    type CallbackCase = {
      name: string;
      inputs: {
        callback: DiscordInteractionCallback;
        options?: Parameters<
          typeof createDiscordOperatorInteractionFromCallback
        >[1];
      };
      mock: () => Record<string, never>;
      assert: (
        context: Record<string, never>,
        inputs: CallbackCase['inputs'],
      ) => void;
    };

    const cases = [
      {
        name: 'maps a guild slash command callback to the current channel thread',
        inputs: {
          callback: {
            id: 'callback-001',
            token: 'token-001',
            channel_id: 'thread-001',
            data: {
              name: 'retry-gates',
            },
            member: {
              user: {
                id: 'operator-001',
              },
            },
          },
          options: {
            updatedAt: '2026-04-04T00:00:00.000Z',
            summary: 'Retry gates from Discord.',
            privileged: false,
            boundSession: {
              id: 'thread-session-callback-001',
              summary: 'Implementation session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-001',
              channelId: 'thread-001',
              parentChannelId: 'implementation-channel',
              threadId: 'thread-001',
              kind: 'implementation',
              specId: 'spec-001',
              sliceId: 'slice-001',
              pullRequestNumber: null,
              artifactId: 'artifact-001',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
            inputs.options,
          );

          expect(interaction).toMatchObject({
            id: 'callback-001',
            token: 'token-001',
            actorId: 'operator-001',
            channelId: 'thread-001',
            threadId: 'thread-001',
            commandName: 'retry-gates',
            updatedAt: '2026-04-04T00:00:00.000Z',
            summary: 'Retry gates from Discord.',
            privileged: false,
            boundSession: {
              threadId: 'thread-001',
              kind: 'implementation',
            },
          });
        },
      },
      {
        name: 'maps a button callback custom id with an explicit bound thread',
        inputs: {
          callback: {
            id: 'callback-002',
            token: 'token-002',
            channel_id: 'parent-channel-002',
            data: {
              custom_id: 'devplat:show-status',
            },
            user: {
              id: 'operator-002',
            },
          },
          options: {
            boundThreadId: 'thread-002',
            threadId: 'thread-002',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
            inputs.options,
          );

          expect(interaction).toMatchObject({
            id: 'callback-002',
            actorId: 'operator-002',
            channelId: 'parent-channel-002',
            threadId: 'thread-002',
            boundThreadId: 'thread-002',
            customId: 'devplat:show-status',
          });
        },
      },
      {
        name: 'rejects callbacks without an actor user id',
        inputs: {
          callback: {
            id: 'callback-003',
            token: 'token-003',
            channel_id: 'thread-003',
            data: {
              name: 'show-status',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          expect(() =>
            createDiscordOperatorInteractionFromCallback(inputs.callback),
          ).toThrow('actor user id');
        },
      },
      {
        name: 'uses callback defaults when optional binding metadata is absent',
        inputs: {
          callback: {
            id: 'callback-004',
            token: 'token-004',
            channel_id: 'thread-004',
            data: {
              custom_id: 'devplat:show-status',
            },
            user: {
              id: 'operator-004',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );

          expect(interaction).toMatchObject({
            id: 'callback-004',
            token: 'token-004',
            actorId: 'operator-004',
            channelId: 'thread-004',
            threadId: 'thread-004',
            customId: 'devplat:show-status',
          });
          expect(interaction.commandName).toBeUndefined();
          expect(interaction.boundThreadId).toBeUndefined();
          expect(interaction.boundSession).toBeUndefined();
          expect(interaction.summary).toBeUndefined();
          expect(interaction.privileged).toBeUndefined();
          expect(new Date(interaction.updatedAt).toISOString()).toBe(
            interaction.updatedAt,
          );
        },
      },
      {
        name: 'rejects callbacks without a channel id',
        inputs: {
          callback: {
            id: 'callback-005',
            token: 'token-005',
            channel_id: ' ',
            data: {
              name: 'show-status',
            },
            user: {
              id: 'operator-005',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          expect(() =>
            createDiscordOperatorInteractionFromCallback(inputs.callback),
          ).toThrow('channel id');
        },
      },
    ] satisfies CallbackCase[];

    for (const testCase of cases) {
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    }
  });

  it('projects and describes bound work items from thread sessions', () => {
    type WorkItemCase =
      | {
          name: string;
          inputs: {
            mode: 'session';
            session: DiscordThreadSession;
            expectedBinding: Partial<DiscordWorkItemBinding>;
            expectedDescription: string;
          };
          mock: () => Record<string, never>;
          assert: (
            context: Record<string, never>,
            inputs: WorkItemCase['inputs'],
          ) => void;
        }
      | {
          name: string;
          inputs: {
            mode: 'description';
            workItem: DiscordWorkItemBinding;
            expectedDescription: string;
          };
          mock: () => Record<string, never>;
          assert: (
            context: Record<string, never>,
            inputs: WorkItemCase['inputs'],
          ) => void;
        };

    const cases = [
      {
        name: 'projects spec sessions',
        inputs: {
          mode: 'session',
          session: {
            id: 'thread-session-spec',
            summary: 'Spec session',
            status: 'running',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-spec',
            channelId: 'thread-spec',
            parentChannelId: 'spec-channel',
            threadId: 'thread-spec',
            kind: 'spec',
            specId: 'spec-1',
            sliceId: null,
            pullRequestNumber: null,
            artifactId: 'artifact-spec',
          },
          expectedBinding: {
            threadKind: 'spec',
            specId: 'spec-1',
          },
          expectedDescription: 'spec spec-1 in thread-spec',
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          if (inputs.mode !== 'session') {
            throw new Error('expected session inputs');
          }

          const binding = createDiscordWorkItemBinding(inputs.session);

          expect(binding).toMatchObject(inputs.expectedBinding);
          expect(describeDiscordWorkItemBinding(binding)).toBe(
            inputs.expectedDescription,
          );
        },
      },
      {
        name: 'projects implementation sessions without spec ids',
        inputs: {
          mode: 'session',
          session: {
            id: 'thread-session-implementation',
            summary: 'Implementation session',
            status: 'running',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-implementation',
            channelId: 'thread-implementation',
            parentChannelId: 'implementation-channel',
            threadId: 'thread-implementation',
            kind: 'implementation',
            specId: null,
            sliceId: 'slice-1',
            pullRequestNumber: null,
            artifactId: 'artifact-implementation',
          },
          expectedBinding: {
            threadKind: 'implementation',
            sliceId: 'slice-1',
          },
          expectedDescription:
            'implementation slice-1 in thread-implementation',
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          if (inputs.mode !== 'session') {
            throw new Error('expected session inputs');
          }

          const binding = createDiscordWorkItemBinding(inputs.session);

          expect(binding).toMatchObject(inputs.expectedBinding);
          expect(binding.specId).toBeUndefined();
          expect(describeDiscordWorkItemBinding(binding)).toBe(
            inputs.expectedDescription,
          );
        },
      },
      {
        name: 'describes incomplete pull request work items',
        inputs: {
          mode: 'description',
          workItem: {
            threadKind: 'pull-request',
            threadId: 'thread-pr',
            artifactId: 'artifact-pr',
          },
          expectedDescription: 'pull-request thread-pr',
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          if (inputs.mode !== 'description') {
            throw new Error('expected description inputs');
          }

          expect(describeDiscordWorkItemBinding(inputs.workItem)).toBe(
            inputs.expectedDescription,
          );
        },
      },
      {
        name: 'projects pull request sessions without spec or slice ids',
        inputs: {
          mode: 'session',
          session: {
            id: 'thread-session-pull-request',
            summary: 'Pull request session',
            status: 'running',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-pull-request',
            channelId: 'thread-pull-request',
            parentChannelId: 'pull-request-channel',
            threadId: 'thread-pull-request',
            kind: 'pull-request',
            specId: null,
            sliceId: null,
            pullRequestNumber: 27,
            artifactId: 'artifact-pull-request',
          },
          expectedBinding: {
            threadKind: 'pull-request',
            pullRequestNumber: 27,
          },
          expectedDescription: 'pull-request #27 in thread-pull-request',
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          if (inputs.mode !== 'session') {
            throw new Error('expected session inputs');
          }

          const binding = createDiscordWorkItemBinding(inputs.session);

          expect(binding).toMatchObject(inputs.expectedBinding);
          expect(binding.specId).toBeUndefined();
          expect(binding.sliceId).toBeUndefined();
          expect(describeDiscordWorkItemBinding(binding)).toBe(
            inputs.expectedDescription,
          );
        },
      },
      {
        name: 'describes incomplete implementation work items',
        inputs: {
          mode: 'description',
          workItem: {
            threadKind: 'implementation',
            threadId: 'thread-implementation',
            artifactId: 'artifact-implementation',
          },
          expectedDescription: 'implementation thread-implementation',
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          if (inputs.mode !== 'description') {
            throw new Error('expected description inputs');
          }

          expect(describeDiscordWorkItemBinding(inputs.workItem)).toBe(
            inputs.expectedDescription,
          );
        },
      },
      {
        name: 'describes incomplete spec work items',
        inputs: {
          mode: 'description',
          workItem: {
            threadKind: 'spec',
            threadId: 'thread-spec',
            artifactId: 'artifact-spec',
          },
          expectedDescription: 'spec thread-spec',
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          if (inputs.mode !== 'description') {
            throw new Error('expected description inputs');
          }

          expect(describeDiscordWorkItemBinding(inputs.workItem)).toBe(
            inputs.expectedDescription,
          );
        },
      },
    ] satisfies WorkItemCase[];

    for (const testCase of cases) {
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    }
  });
});
