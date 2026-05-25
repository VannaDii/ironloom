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
} from './codec.js';
import type { DiscordThreadSession } from '../thread-session/codec.js';

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

  describe('real operator interaction routing', () => {
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
            id: 'interaction-009b',
            token: 'token-9b',
            actorId: 'user-9b',
            channelId: 'channel-9b',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            boundSession: {
              id: 'thread-session-009b',
              summary: 'Implementation session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-9b',
              channelId: 'thread-9b',
              parentChannelId: 'implementation-channel',
              threadId: '  thread-9b  ',
              kind: 'implementation',
              specId: 'spec-9b',
              sliceId: 'slice-9b',
              pullRequestNumber: null,
              artifactId: 'artifact-9b',
            },
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.threadId).toBe('thread-9b');
            expect(route.request.workItem).toMatchObject({
              threadKind: 'implementation',
              threadId: '  thread-9b  ',
              specId: 'spec-9b',
              sliceId: 'slice-9b',
              artifactId: 'artifact-9b',
            });
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008m2',
            token: 'token-8m2',
            actorId: 'user-8m2',
            channelId: 'channel-8m2',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'redirect',
            boundThreadId: 'thread-8m2',
            redirectPrompt: 'focus(intent:spoof): now)',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.summary).toContain(
              'direction-prompt:focus[intent-spoof]- now]',
            );
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008i',
            token: 'token-8i',
            actorId: 'user-8i',
            channelId: 'channel-8i',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'new-project',
            boundThreadId: 'thread-8i',
            projectRepo: 'devplat',
            projectName: 'ab',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain(
              'new-project requires --project length 3-30 characters.',
            );
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008n2',
            token: 'token-8n2',
            actorId: 'user-8n2',
            channelId: 'channel-8n2',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'consider',
            boundThreadId: 'thread-8n2',
            considerUrl: 'https://example.com/(intent:spoof):v1',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.summary).toContain(
              'url:https-//example.com/[intent-spoof]-v1',
            );
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008j',
            token: 'token-8j',
            actorId: 'user-8j',
            channelId: 'channel-8j',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'open-project',
            boundThreadId: 'thread-8j',
            projectRepo: 'devplat',
            projectName: 'abcdefghijklmnopqrstuvwxyzabcde',
            openProjectIntent: 'maintenance',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain(
              'open-project requires --project length 3-30 characters.',
            );
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008d',
            token: 'token-8d',
            actorId: 'user-8d',
            channelId: 'channel-8d',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'resume-project',
            boundThreadId: 'thread-8d',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
            resumeProjectForce: true,
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('resume-project');
            expect(route.request.summary).toContain('force:true');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007alts',
            token: 'token-7alts',
            actorId: 'user-7alts',
            channelId: 'channel-7alts',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'alts',
            threadId: 'thread-7alts',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('alternatives');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007cancel-deny',
            token: 'token-007cancel-deny',
            actorId: 'user-007cancel-deny',
            channelId: 'channel-007cancel-deny',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'cancel',
            threadId: 'thread-007cancel-deny',
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('requiredRole=project-operator');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007cancel-allow',
            token: 'token-007cancel-allow',
            actorId: 'user-007cancel-allow',
            channelId: 'channel-007cancel-allow',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'cancel',
            threadId: 'thread-007cancel-allow',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('cancel-project');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007e',
            token: 'token-7e',
            actorId: 'user-7e',
            channelId: 'channel-7e',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'new-project',
            boundThreadId: 'thread-7e',
            projectRepo: 'devplat',
            projectName: 'alpha',
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('requiredRole=project-operator');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007f',
            token: 'token-7f',
            actorId: 'user-7f',
            channelId: 'channel-7f',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'project-settings-history',
            threadId: 'thread-7f',
            projectSettingsHistoryDetailed: true,
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('requiredRole=project-operator');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007g',
            token: 'token-7g',
            actorId: 'user-7g',
            channelId: 'channel-7g',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'project-settings-history',
            threadId: 'thread-7g',
            projectSettingsHistoryDetailed: false,
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('project-settings-history');
            expect(route.request.summary).toContain('mode:summary');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007h',
            token: 'token-7h',
            actorId: 'user-7h',
            channelId: 'channel-7h',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'project-settings-history',
            threadId: 'thread-7h',
            projectSettingsHistoryDetailed: true,
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('project-settings-history');
            expect(route.request.summary).toContain('mode:detailed');
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
            expect(route.reason).toContain('project/thread context mismatch');
            expect(route.reason).toContain('Recovery: /open-project');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010a',
            token: 'token-10a',
            actorId: 'user-10a',
            channelId: 'thread-10a',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'project-summary',
            threadId: 'thread-10a',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('project-summary');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010b',
            token: 'token-10b',
            actorId: 'user-10b',
            channelId: 'thread-11',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            boundThreadId: 'thread-11',
            boundSession: {
              id: 'thread-session-010b',
              summary: 'Pull request session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-10b',
              channelId: 'thread-11',
              parentChannelId: 'pull-request-channel',
              threadId: ' thread-11 ',
              kind: 'pull-request',
              specId: 'spec-10b',
              sliceId: 'slice-10b',
              pullRequestNumber: 11,
              artifactId: 'artifact-10b',
            },
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.threadId).toBe('thread-11');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010i',
            token: 'token-10i',
            actorId: 'user-10i',
            channelId: 'thread-10i',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show-last-artifact',
            threadId: 'thread-10i',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('show-last-artifact');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010j',
            token: 'token-10j',
            actorId: 'user-10j',
            channelId: 'thread-10j',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'phase-contract',
            threadId: 'thread-10j',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('phase-contract');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010c',
            token: 'token-10c',
            actorId: 'user-10c',
            channelId: 'thread-10c',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'approve-this',
            boundThreadId: 'thread-10c',
            boundSession: {
              id: 'thread-session-010c',
              summary: 'Pull request session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-10c',
              channelId: 'thread-10c',
              parentChannelId: 'pull-request-channel',
              threadId: 'thread-10c',
              kind: 'pull-request',
              specId: 'spec-10c',
              sliceId: 'slice-10c',
              pullRequestNumber: 10,
              artifactId: 'artifact-10c',
            },
            actorRoleIds: ['role-merge-approver'],
            mergeApproverRoleId: 'role-merge-approver',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('approve-this');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010k',
            token: 'token-10k',
            actorId: 'user-10k',
            channelId: 'thread-10k',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show-status',
            threadId: 'thread-10k',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('show-status');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010l',
            token: 'token-10l',
            actorId: 'user-10l',
            channelId: 'thread-10l',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'project-settings-history',
            threadId: 'thread-10l',
            projectSettingsHistoryDetailed: false,
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('project-settings-history');
            expect(route.request.summary).toContain('mode:summary');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010e',
            token: 'token-10e',
            actorId: 'user-10e',
            channelId: 'thread-10e',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release-project',
            boundThreadId: 'thread-10e',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('release-project');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010e-merge',
            token: 'token-10e-merge',
            actorId: 'user-10e-merge',
            channelId: 'thread-10e-merge',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release-project',
            boundThreadId: 'thread-10e-merge',
            actorRoleIds: ['role-merge-approver'],
            mergeApproverRoleId: 'role-merge-approver',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('release-project');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010e-denied',
            token: 'token-10e-denied',
            actorId: 'user-10e-denied',
            channelId: 'thread-10e-denied',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release-project',
            boundThreadId: 'thread-10e-denied',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain(
              'requiredRole=project-operator|merge-approver',
            );
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010e-denied-configured',
            token: 'token-10e-denied-configured',
            actorId: 'user-10e-denied-configured',
            channelId: 'thread-10e-denied-configured',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release-project',
            boundThreadId: 'thread-10e-denied-configured',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
            mergeApproverRoleId: 'role-merge-approver',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('release-project');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010e-denied-partial-mapping',
            token: 'token-10e-denied-partial-mapping',
            actorId: 'user-10e-denied-partial-mapping',
            channelId: 'thread-10e-denied-partial-mapping',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release-project',
            boundThreadId: 'thread-10e-denied-partial-mapping',
            actorRoleIds: ['role-other'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('missingRoleMapping=merge-approver');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010f',
            token: 'token-10f',
            actorId: 'user-10f',
            channelId: 'thread-10f',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'merge-now',
            boundThreadId: 'thread-10f',
            actorRoleIds: ['role-merge-approver'],
            mergeApproverRoleId: 'role-merge-approver',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.privileged).toBe(false);
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010d',
            token: 'token-10d',
            actorId: 'user-10d',
            channelId: 'thread-10d',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'approve-this',
            boundThreadId: 'thread-10d',
            actorRoleIds: ['role-spec-approver'],
            specApproverRoleId: 'role-spec-approver',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.privileged).toBe(false);
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010d-denied-spec',
            token: 'token-10d-denied-spec',
            actorId: 'user-10d-denied-spec',
            channelId: 'thread-10d-denied-spec',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'approve-this',
            boundThreadId: 'thread-10d-denied-spec',
            specApproverRoleId: 'role-spec-approver',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('requiredRole=spec-approver');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-010d-denied-pr',
            token: 'token-10d-denied-pr',
            actorId: 'user-10d-denied-pr',
            channelId: 'thread-10d-denied-pr',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'approve-this',
            boundThreadId: 'thread-10d-denied-pr',
            boundSession: {
              id: 'thread-session-010d-denied-pr',
              summary: 'Pull request session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-10d-denied-pr',
              channelId: 'thread-10d-denied-pr',
              parentChannelId: 'pull-request-channel',
              threadId: 'thread-10d-denied-pr',
              kind: 'pull-request',
              specId: 'spec-10d-denied-pr',
              sliceId: 'slice-10d-denied-pr',
              pullRequestNumber: 101,
              artifactId: 'artifact-10d-denied-pr',
            },
            mergeApproverRoleId: 'role-merge-approver',
            actorRoleIds: ['role-spec-approver'],
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('requiredRole=merge-approver');
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
            expect(route.reason).toContain('project/thread context mismatch');
            expect(route.reason).toContain('Recovery: /open-project');
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
            id: 'interaction-007b',
            token: 'token-7b',
            actorId: 'user-7b',
            channelId: 'channel-7b',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'new-project',
            boundThreadId: 'thread-7b',
            projectRepo: 'devplat',
            projectName: 'alpha',
            newProjectQualityStrictness: 'on',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('new-project');
            expect(route.request.privileged).toBe(false);
            expect(route.request.summary).toContain('quality-strictness:on');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007c',
            token: 'token-7c',
            actorId: 'user-7c',
            channelId: 'channel-7c',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'new-project',
            boundThreadId: 'thread-7c',
            projectRepo: 'devplat',
            projectName: 'alpha',
            actorRoleIds: ['role-spec-approver'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('requiredRole=project-operator');
            expect(route.reason).toContain('context=thread:thread-7c');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007d',
            token: 'token-7d',
            actorId: 'user-7d',
            channelId: 'channel-7d',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'merge-now',
            boundThreadId: 'thread-7d',
            actorRoleIds: ['role-merge-approver'],
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('permission denied');
            expect(route.reason).toContain('missingRoleMapping=merge-approver');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-007d2',
            token: 'token-7d2',
            actorId: 'user-7d2',
            channelId: 'channel-7d2',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release-project',
            threadId: 'thread-7d2',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('release-project');
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
            id: 'interaction-008o',
            token: 'token-8o',
            actorId: 'user-8o',
            channelId: 'channel-8o',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'new-project',
            boundThreadId: 'thread-8o',
            projectRepo: 'owner/repo',
            projectName: '..alpha\\beta',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.summary).toContain('repo:owner-repo');
            expect(route.request.summary).toContain('project:--alpha-beta');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008p',
            token: 'token-8p',
            actorId: 'user-8p',
            channelId: 'channel-8p',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'redirect',
            boundThreadId: 'thread-8p',
            redirectPrompt: `focus ${'x'.repeat(1500)}`,
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.summary.length).toBeLessThanOrEqual(1000);
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008g',
            token: 'token-8g',
            actorId: 'user-8g',
            channelId: 'channel-8g',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'new-project',
            boundThreadId: 'thread-8g',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('new-project requires --repo');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008b',
            token: 'token-8b',
            actorId: 'user-8b',
            channelId: 'channel-8b',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'open-project',
            boundThreadId: 'thread-8b',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('open-project requires --repo');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008h',
            token: 'token-8h',
            actorId: 'user-8h',
            channelId: 'channel-8h',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'open-project',
            boundThreadId: 'thread-8h',
            projectRepo: 'devplat',
            projectName: 'beta',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('open-project requires --intent');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008c',
            token: 'token-8c',
            actorId: 'user-8c',
            channelId: 'channel-8c',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'open-project',
            boundThreadId: 'thread-8c',
            projectRepo: 'devplat',
            projectName: 'beta',
            openProjectIntent: 'bugfix',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('open-project');
            expect(route.request.summary).toContain('repo:devplat');
            expect(route.request.summary).toContain('project:beta');
            expect(route.request.summary).toContain('intent:bugfix');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008d',
            token: 'token-8d',
            actorId: 'user-8d',
            channelId: 'channel-8d',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'open-project',
            boundThreadId: 'thread-8d',
            projectRepo: 'devplat(intent:spoof)',
            projectName: 'beta:phase(one)',
            openProjectIntent: 'maintenance',
            actorRoleIds: ['role-project-operator'],
            projectOperatorRoleId: 'role-project-operator',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.summary).toContain(
              'repo:devplat[intent-spoof]',
            );
            expect(route.request.summary).toContain('project:beta-phase[one]');
            expect(route.request.summary).toContain('intent:maintenance');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008k',
            token: 'token-8k',
            actorId: 'user-8k',
            channelId: 'channel-8k',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'redirect',
            boundThreadId: 'thread-8k',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain(
              'redirect requires --direction-prompt',
            );
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008l',
            token: 'token-8l',
            actorId: 'user-8l',
            channelId: 'channel-8l',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'consider',
            boundThreadId: 'thread-8l',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('consider requires --url');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008m',
            token: 'token-8m',
            actorId: 'user-8m',
            channelId: 'channel-8m',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'redirect',
            boundThreadId: 'thread-8m',
            redirectPrompt: 'focus on operational health visibility',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.summary).toContain(
              'direction-prompt:focus on operational health visibility',
            );
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-008n',
            token: 'token-8n',
            actorId: 'user-8n',
            channelId: 'channel-8n',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'consider',
            boundThreadId: 'thread-8n',
            considerUrl: 'https://example.com/dependency-risk-model',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.summary).toContain(
              'url:https-//example.com/dependency-risk-model',
            );
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
            expect(route.reason).toContain('project/thread context mismatch');
            expect(route.reason).toContain('Recovery: /open-project');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-011',
            token: 'token-11',
            actorId: 'user-11',
            channelId: 'thread-12',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:show-status:thread-11',
            threadId: 'thread-11',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(true);
          if (route.ok) {
            expect(route.request.action).toBe('show-status');
            expect(route.request.threadId).toBe('thread-11');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-012',
            token: 'token-12',
            actorId: 'user-12',
            channelId: 'thread-12',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:pause-this:thread-encoded',
            threadId: 'thread-current',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => undefined,
        assert: (
          route: ReturnType<typeof createDiscordControlRequestFromInteraction>,
        ) => {
          expect(route.ok).toBe(false);
          if (!route.ok) {
            expect(route.reason).toContain('project/thread context mismatch');
            expect(route.reason).toContain('Recovery: /open-project');
          }
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-013',
            token: 'token-13',
            actorId: 'user-13',
            channelId: 'thread-13',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:show-status:thread-13:extra',
            threadId: 'thread-13',
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
            id: 'interaction-014',
            token: 'token-14',
            actorId: 'user-14',
            channelId: 'thread-14',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:unknown-action:thread-14',
            threadId: 'thread-14',
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
            id: 'interaction-015',
            token: 'token-15',
            actorId: 'user-15',
            channelId: 'thread-15',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:show-status: ',
            threadId: 'thread-15',
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
    ];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(
        createDiscordControlRequestFromInteraction(testCase.inputs.interaction),
      );
    });
  });

  describe('raw Discord interaction callback normalization', () => {
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
        name: 'extracts open-project intent from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002b',
            token: 'token-002b',
            channel_id: 'thread-002b',
            data: {
              name: 'open-project',
              options: [
                {
                  name: 'repo',
                  value: 'devplat',
                },
                {
                  name: 'project',
                  value: 'alpha',
                },
                {
                  name: 'intent',
                  value: 'maintenance',
                },
              ],
            },
            user: {
              id: 'operator-002b',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );

          expect(interaction).toMatchObject({
            id: 'callback-002b',
            actorId: 'operator-002b',
            commandName: 'open-project',
            projectRepo: 'devplat',
            projectName: 'alpha',
            openProjectIntent: 'maintenance',
          });
        },
      },
      {
        name: 'extracts bugfix open-project intent from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002c',
            token: 'token-002c',
            channel_id: 'thread-002c',
            data: {
              name: 'open-project',
              options: [
                {
                  name: 'repo',
                  value: 'devplat',
                },
                {
                  name: 'project',
                  value: 'alpha',
                },
                {
                  name: 'intent',
                  value: 'bugfix',
                },
              ],
            },
            user: {
              id: 'operator-002c',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.openProjectIntent).toBe('bugfix');
        },
      },
      {
        name: 'extracts new-feature open-project intent from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002d',
            token: 'token-002d',
            channel_id: 'thread-002d',
            data: {
              name: 'open-project',
              options: [
                {
                  name: 'repo',
                  value: 'devplat',
                },
                {
                  name: 'project',
                  value: 'alpha',
                },
                {
                  name: 'intent',
                  value: 'new-feature',
                },
              ],
            },
            user: {
              id: 'operator-002d',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.openProjectIntent).toBe('new-feature');
        },
      },
      {
        name: 'extracts new-project repo and project options from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002g',
            token: 'token-002g',
            channel_id: 'thread-002g',
            data: {
              name: 'new-project',
              options: [
                {
                  name: 'repo',
                  value: 'devplat',
                },
                {
                  name: 'project',
                  value: 'mobile-run',
                },
              ],
            },
            user: {
              id: 'operator-002g',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.projectRepo).toBe('devplat');
          expect(interaction.projectName).toBe('mobile-run');
        },
      },
      {
        name: 'extracts new-project quality strictness option from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002g2',
            token: 'token-002g2',
            channel_id: 'thread-002g2',
            data: {
              name: 'new-project',
              options: [
                {
                  name: 'repo',
                  value: 'devplat',
                },
                {
                  name: 'project',
                  value: 'mobile-run',
                },
                {
                  name: 'quality-strictness',
                  value: 'off',
                },
              ],
            },
            user: {
              id: 'operator-002g2',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.newProjectQualityStrictness).toBe('off');
        },
      },
      {
        name: 'extracts redirect prompt from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002g4',
            token: 'token-002g4',
            channel_id: 'thread-002g4',
            data: {
              name: 'redirect',
              options: [
                {
                  name: 'direction-prompt',
                  value: 'focus on mobile handoff and rollback risks',
                },
              ],
            },
            user: {
              id: 'operator-002g4',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.redirectPrompt).toBe(
            'focus on mobile handoff and rollback risks',
          );
        },
      },
      {
        name: 'extracts consider url from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002g5',
            token: 'token-002g5',
            channel_id: 'thread-002g5',
            data: {
              name: 'consider',
              options: [
                {
                  name: 'url',
                  value: 'https://example.com/operator-reference',
                },
              ],
            },
            user: {
              id: 'operator-002g5',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.considerUrl).toBe(
            'https://example.com/operator-reference',
          );
        },
      },
      {
        name: 'extracts new-project quality strictness on option from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002g3',
            token: 'token-002g3',
            channel_id: 'thread-002g3',
            data: {
              name: 'new-project',
              options: [
                {
                  name: 'repo',
                  value: 'devplat',
                },
                {
                  name: 'project',
                  value: 'mobile-run',
                },
                {
                  name: 'quality-strictness',
                  value: 'on',
                },
              ],
            },
            user: {
              id: 'operator-002g3',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.newProjectQualityStrictness).toBe('on');
        },
      },
      {
        name: 'extracts resume-project force flag from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002e',
            token: 'token-002e',
            channel_id: 'thread-002e',
            data: {
              name: 'resume-project',
              options: [
                {
                  name: 'force',
                  value: 'force',
                },
              ],
            },
            user: {
              id: 'operator-002e',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.resumeProjectForce).toBe(true);
        },
      },
      {
        name: 'treats non-force resume-project option values as false',
        inputs: {
          callback: {
            id: 'callback-002f',
            token: 'token-002f',
            channel_id: 'thread-002f',
            data: {
              name: 'resume-project',
              options: [
                {
                  name: 'force',
                  value: 'no',
                },
              ],
            },
            user: {
              id: 'operator-002f',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.resumeProjectForce).toBe(false);
        },
      },
      {
        name: 'extracts detailed project-settings-history mode from slash-command options',
        inputs: {
          callback: {
            id: 'callback-002h',
            token: 'token-002h',
            channel_id: 'thread-002h',
            data: {
              name: 'project-settings-history',
              options: [
                {
                  name: 'mode',
                  value: 'detailed',
                },
              ],
            },
            user: {
              id: 'operator-002h',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.projectSettingsHistoryDetailed).toBe(true);
        },
      },
      {
        name: 'treats non-detailed project-settings-history mode as summary',
        inputs: {
          callback: {
            id: 'callback-002i',
            token: 'token-002i',
            channel_id: 'thread-002i',
            data: {
              name: 'project-settings-history',
              options: [
                {
                  name: 'mode',
                  value: 'summary',
                },
              ],
            },
            user: {
              id: 'operator-002i',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );
          expect(interaction.projectSettingsHistoryDetailed).toBe(false);
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
      {
        name: 'keeps received event diagnostics bounded without interaction data',
        inputs: {
          callback: {
            id: 'callback-006',
            token: 'token-006',
            channel_id: 'thread-006',
            user: {
              id: 'operator-006',
            },
          },
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );

          expect(interaction).toMatchObject({
            id: 'callback-006',
            actorId: 'operator-006',
            channelId: 'thread-006',
            threadId: 'thread-006',
          });
          expect(interaction.commandName).toBeUndefined();
          expect(interaction.customId).toBeUndefined();
          expect(interaction.receivedEvent).toEqual({
            id: 'callback-006',
            token: 'token-006',
            channel_id: 'thread-006',
            user: {
              id: 'operator-006',
            },
          });
        },
      },
      {
        name: 'projects only safe received event fields from permissive callbacks',
        inputs: {
          callback: JSON.parse(`{
            "id": "callback-007",
            "token": "token-007",
            "channel_id": "thread-007",
            "data": {
              "name": "show-status",
              "custom_id": "devplat:v1:show-status:thread-007",
              "options": [
                {
                  "name": "operator-input",
                  "value": "do not echo"
                }
              ],
              "resolved": {
                "users": {
                  "operator-007": {
                    "username": "operator"
                  }
                }
              }
            },
            "member": {
              "user": {
                "id": "member-operator-007",
                "username": "member operator"
              },
              "roles": ["role-1"],
              "nick": "member nickname"
            },
            "user": {
              "id": "operator-007",
              "username": "operator direct"
            }
          }`),
        },
        mock: () => ({}),
        assert: (context, inputs) => {
          const interaction = createDiscordOperatorInteractionFromCallback(
            inputs.callback,
          );

          expect(interaction.receivedEvent).toEqual({
            id: 'callback-007',
            token: 'token-007',
            channel_id: 'thread-007',
            data: {
              name: 'show-status',
              custom_id: 'devplat:v1:show-status:thread-007',
            },
            member: {
              user: {
                id: 'member-operator-007',
              },
              roles: ['role-1'],
            },
            user: {
              id: 'operator-007',
            },
          });
        },
      },
    ] satisfies CallbackCase[];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  });

  describe('bound work item projection and description', () => {
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
      {
        name: 'describes spec work items with explicit spec identifiers',
        inputs: {
          mode: 'description',
          workItem: {
            threadKind: 'spec',
            threadId: 'thread-spec-identified',
            specId: 'spec-identified',
            artifactId: 'artifact-spec-identified',
          },
          expectedDescription: 'spec spec-identified in thread-spec-identified',
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

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  });
});
