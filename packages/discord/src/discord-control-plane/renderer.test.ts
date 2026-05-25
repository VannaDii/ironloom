import { describe, expect, it } from 'vitest';

import { DISCORD_MESSAGE_CONTENT_MAX_LENGTH } from './constants.js';
import {
  assertDiscordButtonLabelFits,
  renderDiscordActionComponentRows,
  renderDiscordArtifactMessage,
  renderDiscordControlAcceptedMessage,
  renderDiscordControlBlockedMessage,
  renderDiscordFailureExplanationMessage,
  renderDiscordInteractionCompletionMessage,
  renderDiscordInteractionThreadPostFailureCompletionMessage,
  renderDiscordRouteFailureMessage,
  renderDiscordStatusMessage,
} from './renderer.js';
import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordOperatorInteraction,
} from './codec.js';

describe('Discord control-plane renderer', () => {
  const allActions: readonly DiscordControlAction[] = [
    'run-this',
    'claim-this',
    'approve-this',
    'block-this',
    'complete-this',
    'pause-this',
    'resume-this',
    'rebase-all-dependents',
    'retry-gates',
    'merge-now',
    'show-status',
    'show-last-artifact',
    'explain-failure',
    'sync-worktree',
    'release-worktree',
    'update-spec',
  ];
  const projectActions: readonly DiscordControlAction[] = [
    'alternatives',
    'cancel-project',
    'consider',
    'new-project',
    'open-project',
    'phase-contract',
    'project-settings',
    'project-settings-history',
    'project-summary',
    'redirect',
    'release-project',
    'research',
    'resume-project',
    'spec',
  ];
  const request = {
    id: 'run-1',
    summary: 'Run implementation',
    status: 'running',
    trace: [],
    updatedAt: '2026-05-01T00:00:00.000Z',
    actorId: 'operator-1',
    threadId: 'thread-1',
    channelId: 'thread-1',
    action: 'run-this',
    privileged: false,
    workItem: {
      threadKind: 'implementation',
      threadId: 'thread-1',
      specId: 'spec-1',
      sliceId: 'slice-1',
      artifactId: 'artifact-1',
    },
  } satisfies DiscordControlRequest;
  const interaction = {
    id: 'interaction-1',
    token: 'token-1',
    actorId: 'operator-1',
    channelId: 'thread-1',
    updatedAt: '2026-05-01T00:00:00.000Z',
    commandName: 'run this',
    threadId: 'thread-1',
    receivedEvent: {
      id: 'interaction-1',
      token: 'token-1',
      channel_id: 'thread-1',
      data: {
        name: 'run this',
      },
      user: {
        id: 'operator-1',
      },
    },
  } satisfies DiscordOperatorInteraction;
  const sensitiveReceivedEvent = {
    id: 'interaction-sensitive',
    token: 'token-sensitive',
    channel_id: 'thread-sensitive',
    authorization: 'authorization-sensitive',
    signature: 'signature-sensitive',
    publicKey: 'public-key-sensitive',
    private_key: 'private-key-sensitive',
    authToken: 'auth-token-sensitive',
    db_secret: 'db-secret-sensitive',
    password: 'password-sensitive',
    apiKey: 'api-key-sensitive',
    actorRoleIds: ['role-sensitive-1'],
    projectOperatorRoleId: 'role-sensitive-project',
    mergeApproverRoleId: 'role-sensitive-merge',
    roles: ['role-sensitive-a', 'role-sensitive-b'],
    items: [{ token: 'token-array-sensitive' }, 'literal-event-value'],
    member: {
      roles: ['role-sensitive-member'],
    },
    data: {
      name: 'run this',
      custom_id: 'devplat:v1:thread-sensitive:run-this',
      nestedApiKey: 'nested-api-key-sensitive',
      mergeApproverRoleId: 'role-merge-approver',
    },
  };
  const largeReceivedEvent = {
    id: 'interaction-large',
    token: 'token-large',
    channel_id: 'thread-large',
    data: {
      name: 'run this',
      detail: 'x'.repeat(DISCORD_MESSAGE_CONTENT_MAX_LENGTH),
    },
  };
  const circularReceivedEvent: {
    id: string;
    token: string;
    channel_id: string;
    self?: unknown;
  } = {
    id: 'interaction-circular',
    token: 'token-circular',
    channel_id: 'thread-circular',
  };
  circularReceivedEvent.self = circularReceivedEvent;
  const nonErrorSerializationFailure = {
    toString: () => 'non-error-serialization-failure',
  };
  const nonErrorSerializableEvent = {
    id: 'interaction-non-error-serialization',
    token: 'token-non-error-serialization',
    channel_id: 'thread-non-error-serialization',
    toJSON: () => {
      throw nonErrorSerializationFailure;
    },
  };

  const cases = [
    {
      name: 'renders deferred interaction completion without action buttons',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordInteractionCompletionMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordInteractionCompletionMessage>,
      ) => {
        expect(payload.content).toContain('ℹ️ DevPlat · Interaction completed');
        expect(payload.content).toContain('Status: posted');
        expect(payload.content).toContain('Scope: implementation · thread-1');
        expect(payload.content).toContain(
          '→ Result posted to the bound thread.',
        );
        expect(payload.components).toBeUndefined();
        expect(payload.flags).toBe(64);
      },
    },
    {
      name: 'renders deferred interaction thread-post failure completion without action buttons',
      inputs: {
        request,
        reason: 'Discord thread status message returned HTTP 403.',
      },
      mock: ({
        request: inputRequest,
        reason,
      }: {
        request: DiscordControlRequest;
        reason: string;
      }) =>
        renderDiscordInteractionThreadPostFailureCompletionMessage(
          inputRequest,
          reason,
        ),
      assert: (
        payload: ReturnType<
          typeof renderDiscordInteractionThreadPostFailureCompletionMessage
        >,
      ) => {
        expect(payload.content).toContain('🔴 DevPlat · Interaction completed');
        expect(payload.content).toContain('Status: thread-post-failed');
        expect(payload.content).toContain(
          'Reason: Discord thread status message returned HTTP 403.',
        );
        expect(payload.content).toContain(
          '→ Action was recorded, but the bound-thread status message failed.',
        );
        expect(payload.components).toBeUndefined();
        expect(payload.flags).toBe(64);
      },
    },
    {
      name: 'renders accepted operator messages as compact structured payloads',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain('🟡 DevPlat · Run requested');
        expect(payload.content).toContain('Status: accepted');
        expect(payload.content).toContain('Scope: implementation · thread-1');
        expect(payload.content).toContain(
          'Item: implementation slice-1 in thread-1',
        );
        expect(payload.content).toContain('Actor: <@operator-1>');
        expect(payload.content).toContain('→ Starting the bound work item.');
        expect(payload.allowed_mentions).toEqual({ parse: [] });
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).toEqual(['Details', 'Show Status', 'Pause']);
      },
    },
    {
      name: 'renders status metadata fields when summary includes config and intent markers',
      inputs: {
        request: {
          ...request,
          action: 'show-status',
          summary: 'Project status (intent:maintenance) (config-version:v7)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain('Run intent: maintenance');
        expect(payload.content).toContain('Config version: v7');
      },
    },
    {
      name: 'prefers the last status metadata markers when summary has duplicates',
      inputs: {
        request: {
          ...request,
          action: 'show-status',
          summary:
            'Project status (intent:maintenance) text (intent:bugfix) (config-version:v1) (config-version:v7)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain('Run intent: bugfix');
        expect(payload.content).toContain('Config version: v7');
      },
    },
    {
      name: 'ignores unterminated status metadata markers in summary text',
      inputs: {
        request: {
          ...request,
          action: 'show-status',
          summary:
            'Project status (intent:maintenance (config-version:v7 without closing markers',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).not.toContain('Run intent:');
        expect(payload.content).not.toContain('Config version:');
      },
    },
    {
      name: 'ignores unterminated config-version marker when no closing parenthesis exists',
      inputs: {
        request: {
          ...request,
          action: 'show-status',
          summary: 'Project status (config-version:v12',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).not.toContain('Config version:');
      },
    },
    {
      name: 'renders policy-denied actions with the standard blocked format',
      inputs: {
        request: {
          ...request,
          action: 'release-worktree',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('🔴 DevPlat · Action blocked');
        expect(payload.content).toContain('Status: blocked');
        expect(payload.content).toContain('Caller: <@operator-1>');
        expect(payload.content).toContain('Action: release-worktree');
        expect(payload.content).toContain(
          'Context: slice:slice-1 thread:thread-1',
        );
        expect(payload.content).toContain('Reason: policy denied this action');
        expect(payload.content).toContain(
          '→ No platform state was changed beyond audit logging.',
        );
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).toEqual(['Details', 'Show Status', 'Explain Failure']);
      },
    },
    {
      name: 'renders blocked status metadata fields when summary includes config and intent markers',
      inputs: {
        request: {
          ...request,
          action: 'show-status',
          summary: 'Project status (intent:maintenance) (config-version:v9)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Run intent: maintenance');
        expect(payload.content).toContain('Config version: v9');
      },
    },
    {
      name: 'renders blocked message with explicit fail-closed reason',
      inputs: {
        request: {
          ...request,
          action: 'open-project',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(
          inputRequest,
          'open-project intent is immutable for this run: expected maintenance, received bugfix.',
        ),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Reason: open-project intent is immutable for this run: expected maintenance, received bugfix.',
        );
      },
    },
    {
      name: 'renders blocked project-level role and thread context without a bound work item',
      inputs: {
        request: {
          ...request,
          action: 'release-project',
          workItem: undefined,
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Context: thread-1');
        expect(payload.content).toContain(
          'Required role: project-operator | merge-approver',
        );
      },
    },
    {
      name: 'renders blocked approve role for pull-request contexts',
      inputs: {
        request: {
          ...request,
          action: 'approve-this',
          workItem: {
            threadKind: 'pull-request',
            threadId: 'thread-pr-1',
            artifactId: 'artifact-pr-1',
            pullRequestNumber: 7,
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Context: pr:#7 thread:thread-pr-1');
        expect(payload.content).toContain('Required role: merge-approver');
      },
    },
    {
      name: 'renders blocked merge role for merge-now actions',
      inputs: {
        request: {
          ...request,
          action: 'merge-now',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Required role: merge-approver');
      },
    },
    {
      name: 'renders blocked project-operator role for new-project actions',
      inputs: {
        request: {
          ...request,
          action: 'new-project',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Required role: project-operator');
      },
    },
    {
      name: 'renders blocked implementation-thread context when implementation slice is unavailable',
      inputs: {
        request: {
          ...request,
          workItem: {
            threadKind: 'implementation',
            threadId: 'thread-noslice',
            artifactId: 'artifact-noslice',
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Context: thread:thread-noslice');
      },
    },
    {
      name: 'renders blocked spec-thread context when spec id is unavailable',
      inputs: {
        request: {
          ...request,
          workItem: {
            threadKind: 'spec',
            threadId: 'thread-nospec',
            artifactId: 'artifact-nospec',
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Context: thread:thread-nospec');
      },
    },
    {
      name: 'renders blocked spec-thread context when spec id is available',
      inputs: {
        request: {
          ...request,
          workItem: {
            threadKind: 'spec',
            threadId: 'thread-spec',
            specId: 'spec-777',
            artifactId: 'artifact-spec',
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Context: spec:spec-777 thread:thread-spec',
        );
      },
    },
    {
      name: 'renders blocked approve role for non-pull-request contexts',
      inputs: {
        request: {
          ...request,
          action: 'approve-this',
          workItem: {
            threadKind: 'implementation',
            threadId: 'thread-approve-impl',
            artifactId: 'artifact-approve-impl',
            sliceId: 'slice-approve-impl',
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Required role: spec-approver');
      },
    },
    {
      name: 'omits required-role hints for actions without explicit role requirements',
      inputs: {
        request: {
          ...request,
          action: 'run-this',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).not.toContain('Required role:');
      },
    },
    {
      name: 'renders route failures with the standard refusal message',
      inputs: {
        interaction,
      },
      mock: ({
        interaction: inputInteraction,
      }: {
        interaction: DiscordOperatorInteraction;
      }) => renderDiscordRouteFailureMessage(inputInteraction),
      assert: (
        payload: ReturnType<typeof renderDiscordRouteFailureMessage>,
      ) => {
        expect(payload.content).toBe(
          [
            '🔴 DevPlat · Action refused',
            '',
            'Status: blocked',
            'Scope: unresolved',
            'Reason: interaction must resolve to exactly one bound thread',
            '→ Run this from the correct spec, implementation, or PR thread.',
            '',
            'Received event:',
            '```json',
            '{',
            '  "id": "interaction-1",',
            '  "token": "[redacted]",',
            '  "channel_id": "thread-1",',
            '  "data": {',
            '    "name": "run this"',
            '  },',
            '  "user": {',
            '    "id": "operator-1"',
            '  }',
            '}',
            '```',
          ].join('\n'),
        );
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).toEqual(['Details', 'Show Status']);
      },
    },
    {
      name: 'renders route failures with an explicit denial reason',
      inputs: {
        interaction,
      },
      mock: ({
        interaction: inputInteraction,
      }: {
        interaction: DiscordOperatorInteraction;
      }) =>
        renderDiscordRouteFailureMessage(
          inputInteraction,
          'permission denied: caller=operator-1 action=new-project requiredRole=project-operator context=thread:thread-1',
        ),
      assert: (
        payload: ReturnType<typeof renderDiscordRouteFailureMessage>,
      ) => {
        expect(payload.content).toContain(
          'Reason: permission denied: caller=operator-1 action=new-project requiredRole=project-operator context=thread:thread-1',
        );
      },
    },
    {
      name: 'renders route-failure diagnostics using normalized interaction input when received event is unavailable',
      inputs: {
        interaction: {
          ...interaction,
          id: 'interaction-no-received-event',
          receivedEvent: undefined,
        } satisfies DiscordOperatorInteraction,
      },
      mock: ({
        interaction: inputInteraction,
      }: {
        interaction: DiscordOperatorInteraction;
      }) => renderDiscordRouteFailureMessage(inputInteraction),
      assert: (
        payload: ReturnType<typeof renderDiscordRouteFailureMessage>,
      ) => {
        expect(payload.content).toContain(
          '"id": "interaction-no-received-event"',
        );
      },
    },
    {
      name: 'redacts nested sensitive route-failure diagnostic keys',
      inputs: {
        interaction: {
          ...interaction,
          id: 'interaction-sensitive',
          receivedEvent: sensitiveReceivedEvent,
        } satisfies DiscordOperatorInteraction,
      },
      mock: ({
        interaction: inputInteraction,
      }: {
        interaction: DiscordOperatorInteraction;
      }) => renderDiscordRouteFailureMessage(inputInteraction),
      assert: (
        payload: ReturnType<typeof renderDiscordRouteFailureMessage>,
      ) => {
        expect(payload.content).toContain('"token": "[redacted]"');
        expect(payload.content).toContain('"authorization": "[redacted]"');
        expect(payload.content).toContain('"signature": "[redacted]"');
        expect(payload.content).toContain('"publicKey": "[redacted]"');
        expect(payload.content).toContain('"private_key": "[redacted]"');
        expect(payload.content).toContain('"authToken": "[redacted]"');
        expect(payload.content).toContain('"db_secret": "[redacted]"');
        expect(payload.content).toContain('"password": "[redacted]"');
        expect(payload.content).toContain('"apiKey": "[redacted]"');
        expect(payload.content).toContain('"nestedApiKey": "[redacted]"');
        expect(payload.content).toContain('"roles": "[redacted]"');
        expect(payload.content).toContain('"actorRoleIds": "[redacted]"');
        expect(payload.content).toContain(
          '"projectOperatorRoleId": "[redacted]"',
        );
        expect(payload.content).toContain(
          '"mergeApproverRoleId": "[redacted]"',
        );
        expect(payload.content).toContain('"literal-event-value"');
      },
    },
    {
      name: 'truncates oversized route-failure diagnostics before Discord content limits',
      inputs: {
        interaction: {
          ...interaction,
          id: 'interaction-large',
          receivedEvent: largeReceivedEvent,
        } satisfies DiscordOperatorInteraction,
      },
      mock: ({
        interaction: inputInteraction,
      }: {
        interaction: DiscordOperatorInteraction;
      }) => renderDiscordRouteFailureMessage(inputInteraction),
      assert: (
        payload: ReturnType<typeof renderDiscordRouteFailureMessage>,
      ) => {
        expect(payload.content.length).toBeLessThanOrEqual(
          DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
        );
        expect(payload.content).toContain('(truncated)');
        expect(payload.content).toContain('```');
      },
    },
    {
      name: 'renders route-failure diagnostics when event serialization fails',
      inputs: {
        interaction: {
          ...interaction,
          id: 'interaction-circular',
          receivedEvent: circularReceivedEvent,
        } satisfies DiscordOperatorInteraction,
      },
      mock: ({
        interaction: inputInteraction,
      }: {
        interaction: DiscordOperatorInteraction;
      }) => renderDiscordRouteFailureMessage(inputInteraction),
      assert: (
        payload: ReturnType<typeof renderDiscordRouteFailureMessage>,
      ) => {
        expect(payload.content).toContain('Received event:\n```json');
        expect(payload.content).toContain('{"error":');
      },
    },
    {
      name: 'renders route-failure diagnostics when event serialization throws a non-error value',
      inputs: {
        interaction: {
          ...interaction,
          id: 'interaction-non-error-serialization',
          receivedEvent: nonErrorSerializableEvent,
        } satisfies DiscordOperatorInteraction,
      },
      mock: ({
        interaction: inputInteraction,
      }: {
        interaction: DiscordOperatorInteraction;
      }) => renderDiscordRouteFailureMessage(inputInteraction),
      assert: (
        payload: ReturnType<typeof renderDiscordRouteFailureMessage>,
      ) => {
        expect(payload.content).toContain(
          '{"error":"non-error-serialization-failure"}',
        );
      },
    },
    {
      name: 'renders contextual component rows with bounded unique custom ids',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordActionComponentRows(inputRequest, [
          'show-status',
          'pause-this',
        ]),
      assert: (
        components: ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        const customIds = components.flatMap((row) =>
          row.components.map((button) => button.custom_id),
        );

        expect(customIds).toEqual([
          'devplat:v1:show-status:thread-1',
          'devplat:v1:pause-this:thread-1',
        ]);
        expect(new Set(customIds).size).toBe(customIds.length);
        for (const customId of customIds) {
          expect(customId.length).toBeLessThanOrEqual(100);
        }
      },
    },
    {
      name: 'splits contextual component rows at Discord row limits',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordActionComponentRows(inputRequest, allActions.slice(0, 6)),
      assert: (
        components: ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        expect(components.map((row) => row.components.length)).toEqual([5, 1]);
      },
    },
    {
      name: 'renders button styles for the full v1 action surface',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordActionComponentRows(inputRequest, allActions),
      assert: (
        components: ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        const renderedActionCount = components.reduce(
          (count, row) => count + row.components.length,
          0,
        );
        expect(renderedActionCount).toBe(allActions.length);
      },
    },
    {
      name: 'renders button styles for project and planning control actions',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordActionComponentRows(inputRequest, projectActions),
      assert: (
        components: ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        const renderedActionCount = components.reduce(
          (count, row) => count + row.components.length,
          0,
        );
        expect(renderedActionCount).toBe(projectActions.length);
      },
    },
    {
      name: 'returns no component rows when no actions are available',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordActionComponentRows(inputRequest, []),
      assert: (
        components: ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        expect(components).toEqual([]);
      },
    },
    {
      name: 'rejects duplicate component custom ids',
      inputs: {
        request,
      },
      mock:
        ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        () =>
          renderDiscordActionComponentRows(inputRequest, [
            'show-status',
            'show-status',
          ]),
      assert: (
        renderRows: () => ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        expect(renderRows).toThrow('unique custom ids');
      },
    },
    {
      name: 'accepts button labels inside the Discord limit',
      inputs: {
        label: 'Show Status',
      },
      mock: ({ label }: { label: string }) =>
        assertDiscordButtonLabelFits(label),
      assert: (label: string) => {
        expect(label).toBe('Show Status');
      },
    },
    {
      name: 'rejects button labels over the Discord limit',
      inputs: {
        label: 'x'.repeat(81),
      },
      mock:
        ({ label }: { label: string }) =>
        () =>
          assertDiscordButtonLabelFits(label),
      assert: (validateLabel: () => string) => {
        expect(validateLabel).toThrow('button label exceeds 80 characters');
      },
    },
    {
      name: 'rejects component custom ids over the Discord limit',
      inputs: {
        request: {
          ...request,
          threadId: 'thread-'.repeat(20),
        },
      },
      mock:
        ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        () =>
          renderDiscordActionComponentRows(inputRequest, ['show-status']),
      assert: (
        renderRows: () => ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        expect(renderRows).toThrow('custom_id exceeds 100 characters');
      },
    },
    {
      name: 'renders every v1 action with contextual buttons',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        allActions.map((action) =>
          renderDiscordControlAcceptedMessage({
            ...inputRequest,
            action,
          }),
        ),
      assert: (
        payloads: readonly ReturnType<
          typeof renderDiscordControlAcceptedMessage
        >[],
      ) => {
        expect(payloads).toHaveLength(allActions.length);
        expect(
          payloads.map((payload) => payload.components?.length ?? 0),
        ).toEqual(allActions.map(() => 1));
      },
    },
    {
      name: 'renders accepted payload controls for project and planning actions',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        projectActions.map((action) =>
          renderDiscordControlAcceptedMessage({
            ...inputRequest,
            action,
          }),
        ),
      assert: (
        payloads: readonly ReturnType<
          typeof renderDiscordControlAcceptedMessage
        >[],
      ) => {
        expect(payloads).toHaveLength(projectActions.length);
      },
    },
    {
      name: 'renders cancel-project accepted message with next-step and artifact follow-up controls',
      inputs: {
        request: {
          ...request,
          action: 'cancel-project',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Project activity paused and cancellation summaries are posted.',
        );
        expect(payload.content).toContain('/show-last-artifact');
        expect(payload.content).toContain('/project-summary');
        expect(payload.content).toContain('/resume-project');
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).toEqual(['Details', 'Project Summary', 'Resume Project']);
      },
    },
    {
      name: 'renders resume-project accepted message with second-confirmation guidance',
      inputs: {
        request: {
          ...request,
          action: 'resume-project',
          summary:
            'resume-project (preflight:forced repo-access:unknown branch-state:unknown pr-status:unknown gate-health:unknown blocker-inventory:unknown issues:thread-not-paused)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'If issues are detected, a second confirmation is required.',
        );
        expect(payload.content).toContain('/resume-project --force');
        expect(payload.content).toContain('Preflight: forced');
        expect(payload.content).toContain(
          'Checks: repo-access:unknown, branch-state:unknown, pr-status:unknown, gate-health:unknown, blocker-inventory:unknown',
        );
        expect(payload.content).toContain('Issues: thread-not-paused');
      },
    },
    {
      name: 'omits resume preflight metadata when marker is malformed',
      inputs: {
        request: {
          ...request,
          action: 'resume-project',
          summary:
            'resume-project (preflight:forced repo-access:unknown issues:thread-not-paused',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).not.toContain('Preflight:');
        expect(payload.content).not.toContain('Checks:');
        expect(payload.content).not.toContain('Issues:');
      },
    },
    {
      name: 'renders resume preflight checks without a mode token when omitted',
      inputs: {
        request: {
          ...request,
          action: 'resume-project',
          summary: 'resume-project (preflight: repo-access:ok issues:none)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).not.toContain('Preflight:');
        expect(payload.content).toContain('Checks: repo-access:ok');
        expect(payload.content).toContain('Issues: none');
      },
    },
    {
      name: 'renders resume preflight mode when checks and issues are absent',
      inputs: {
        request: {
          ...request,
          action: 'resume-project',
          summary: 'resume-project (preflight:ready)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain('Preflight: ready');
        expect(payload.content).not.toContain('Checks:');
        expect(payload.content).not.toContain('Issues:');
      },
    },
    {
      name: 'renders spec accepted controls while keeping research commands available pre-approval',
      inputs: {
        request: {
          ...request,
          action: 'spec',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(
          payload.components?.flatMap((row) =>
            row.components.map((button) => button.label),
          ),
        ).toEqual([
          'Approve',
          'Research',
          'Redirect',
          'Consider',
          'Alternatives',
          'Show Status',
        ]);
      },
    },
    {
      name: 'renders redirect accepted metadata with previous direction when provided',
      inputs: {
        request: {
          ...request,
          action: 'redirect',
          summary:
            'redirect (direction-prompt:focus on mobile operator workflows) (previous-direction:stabilize CI first)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Direction: focus on mobile operator workflows',
        );
        expect(payload.content).toContain(
          'Previous direction: stabilize CI first',
        );
      },
    },
    {
      name: 'renders consider accepted metadata with queued count',
      inputs: {
        request: {
          ...request,
          action: 'consider',
          summary:
            'consider (url:https-//example.com/ops-playbook) (queued-count:3)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'URL: https-//example.com/ops-playbook',
        );
        expect(payload.content).toContain('Queued items: 3');
      },
    },
    {
      name: 'renders research accepted metadata when queued urls are flushed into the run',
      inputs: {
        request: {
          ...request,
          action: 'research',
          summary:
            'research (considered-urls:https-//example.com/one|https-//example.com/two)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Queued URLs used: https-//example.com/one|https-//example.com/two',
        );
      },
    },
    {
      name: 'renders research metadata when stale spec approval checkpoint is cleared',
      inputs: {
        request: {
          ...request,
          action: 'research',
          summary: 'research (stale-spec-approval:cleared)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Prior spec approval checkpoint: cleared',
        );
      },
    },
    {
      name: 'renders exactly three alternatives with effort and risk defaults',
      inputs: {
        request: {
          ...request,
          action: 'alternatives',
          summary: 'alternatives',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain('Alternative 1:');
        expect(payload.content).toContain('Alternative 2:');
        expect(payload.content).toContain('Alternative 3:');
        expect(payload.content).toContain('Effort: S (1-2 days)');
        expect(payload.content).toContain('Effort: M (3-5 days)');
        expect(payload.content).toContain('Effort: L (1-2 weeks)');
        expect(payload.content).toContain('Risk: Low');
        expect(payload.content).toContain('Risk: Medium');
        expect(payload.content).toContain('Risk: High');
        expect(payload.content).toContain('[technical');
        expect(payload.content).toContain('[product');
        expect(payload.content).toContain('[security');
        expect(payload.content).toContain('dependency]');
        expect(payload.content).toContain('operational]');
      },
    },
    {
      name: 'renders explicit alternatives markers when provided',
      inputs: {
        request: {
          ...request,
          action: 'alternatives',
          summary:
            'alternatives ' +
            '(alt-1:Plan A · Effort: S 1-2d · Risk: Low [technical]) ' +
            '(alt-2:Plan B · Effort: M 3-5d · Risk: Medium [product, dependency]) ' +
            '(alt-3:Plan C · Effort: L 1-2w · Risk: High [security, operational])',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Alternative 1: Plan A · Effort: S 1-2d · Risk: Low [technical]',
        );
        expect(payload.content).toContain(
          'Alternative 2: Plan B · Effort: M 3-5d · Risk: Medium [product, dependency]',
        );
        expect(payload.content).toContain(
          'Alternative 3: Plan C · Effort: L 1-2w · Risk: High [security, operational]',
        );
      },
    },
    {
      name: 'renders canonical release summary fields for release-project confirmations',
      inputs: {
        request: {
          ...request,
          action: 'release-project',
          summary: 'release-project (repo:devplat) (branch:main)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain('Repo: devplat');
        expect(payload.content).toContain('Branch: main');
        expect(payload.content).toContain('Merged PR links:');
        expect(payload.content).toContain('Spec link:');
        expect(payload.content).toContain('Slice list/status:');
        expect(payload.content).toContain('Gate results:');
        expect(payload.content).toContain('Unresolved risks:');
        expect(payload.content).toContain('Follow-up recommendations:');
        expect(payload.content).toContain('Asset links:');
        expect(payload.content).toContain('Blocker incidents:');
        expect(payload.content).toContain('Stall incidents:');
        expect(payload.content).toContain('Contract degradation incidents:');
        expect(payload.content).toContain('Incident links:');
      },
    },
    {
      name: 'renders canonical release summary values from explicit release markers',
      inputs: {
        request: {
          ...request,
          action: 'release-project',
          summary:
            'release-project ' +
            '(repo:devplat) ' +
            '(branch:main) ' +
            '(merged-pr-links:https://github.com/VannaDii/devplat/pull/81) ' +
            '(spec-link:https://github.com/VannaDii/devplat/blob/main/spec.md) ' +
            '(slice-list-status:slice-a:merged|slice-b:queued) ' +
            '(gate-results:unit:pass|lint:pass) ' +
            '(unresolved-risks:dependency-drift) ' +
            '(follow-up-recommendations:monitor-rollout) ' +
            '(asset-links:https://example.invalid/release.tgz) ' +
            '(blocker-incidents:current-run:0|lifetime:3) ' +
            '(stall-incidents:current-run:1|lifetime:5) ' +
            '(contract-degradation-incidents:current-run:0|lifetime:2) ' +
            '(incident-links:https://example.invalid/incidents)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain(
          'Merged PR links: https://github.com/VannaDii/devplat/pull/81',
        );
        expect(payload.content).toContain(
          'Spec link: https://github.com/VannaDii/devplat/blob/main/spec.md',
        );
        expect(payload.content).toContain(
          'Slice list/status: slice-a:merged|slice-b:queued',
        );
        expect(payload.content).toContain('Gate results: unit:pass|lint:pass');
        expect(payload.content).toContain('Unresolved risks: dependency-drift');
        expect(payload.content).toContain(
          'Follow-up recommendations: monitor-rollout',
        );
        expect(payload.content).toContain(
          'Asset links: https://example.invalid/release.tgz',
        );
        expect(payload.content).toContain(
          'Blocker incidents: current-run:0|lifetime:3',
        );
        expect(payload.content).toContain(
          'Stall incidents: current-run:1|lifetime:5',
        );
        expect(payload.content).toContain(
          'Contract degradation incidents: current-run:0|lifetime:2',
        );
        expect(payload.content).toContain(
          'Incident links: https://example.invalid/incidents',
        );
      },
    },
    {
      name: 'renders release-project control buttons with danger style',
      inputs: {
        request: {
          ...request,
          action: 'release-project',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordActionComponentRows(inputRequest, ['release-project']),
      assert: (
        components: ReturnType<typeof renderDiscordActionComponentRows>,
      ) => {
        expect(components[0]?.components[0]?.style).toBe(4);
      },
    },
    {
      name: 'shows merge after approval only for pull request threads',
      inputs: {
        request: {
          ...request,
          action: 'approve-this',
          workItem: {
            threadKind: 'pull-request',
            threadId: 'thread-pr',
            artifactId: 'artifact-pr',
            pullRequestNumber: 42,
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).toContain('Merge');
      },
    },
    {
      name: 'does not show merge after approval for non-pull-request threads',
      inputs: {
        request: {
          ...request,
          action: 'approve-this',
          workItem: {
            threadKind: 'implementation',
            threadId: 'thread-impl-approve',
            artifactId: 'artifact-impl-approve',
            sliceId: 'slice-impl-approve',
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).not.toContain('Merge');
      },
    },
    {
      name: 'renders blocked project-operator requirement for project settings actions',
      inputs: {
        request: {
          ...request,
          action: 'project-settings',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Required role: project-operator');
      },
    },
    {
      name: 'renders blocked pull-request context when PR number is unavailable',
      inputs: {
        request: {
          ...request,
          workItem: {
            threadKind: 'pull-request',
            threadId: 'thread-pr-nonumber',
            artifactId: 'artifact-pr-nonumber',
          },
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlBlockedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlBlockedMessage>,
      ) => {
        expect(payload.content).toContain('Context: thread:thread-pr-nonumber');
      },
    },
    {
      name: 'renders thread-scoped items when no work item is bound',
      inputs: {
        request: {
          ...request,
          workItem: undefined,
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordControlAcceptedMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordControlAcceptedMessage>,
      ) => {
        expect(payload.content).toContain('Scope: thread · thread-1');
        expect(payload.content).toContain('Item: Run implementation');
      },
    },
    {
      name: 'renders status messages through the shared content structure',
      inputs: {
        request: {
          ...request,
          status: 'review',
          summary: 'Waiting on gates',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordStatusMessage(inputRequest),
      assert: (payload: ReturnType<typeof renderDiscordStatusMessage>) => {
        expect(payload.content).toContain('ℹ️ DevPlat · Status');
        expect(payload.content).toContain('Status: review');
        expect(payload.content).toContain('Updated: 2026-05-01T00:00:00.000Z');
        expect(payload.content).toContain('→ Waiting on gates');
      },
    },
    {
      name: 'renders artifact messages through the shared content structure',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordArtifactMessage(inputRequest),
      assert: (payload: ReturnType<typeof renderDiscordArtifactMessage>) => {
        expect(payload.content).toContain('📎 DevPlat · Last artifact');
        expect(payload.content).toContain('Status: available');
        expect(payload.content).toContain('Artifact: artifact-1');
        expect(payload.content).toContain('Why this matters now:');
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).toEqual(['Details', 'Show Status', 'Explain Failure']);
      },
    },
    {
      name: 'renders artifact metadata fields when summary includes config and intent markers',
      inputs: {
        request: {
          ...request,
          summary: 'Artifact context (intent:maintenance) (config-version:v11)',
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordArtifactMessage(inputRequest),
      assert: (payload: ReturnType<typeof renderDiscordArtifactMessage>) => {
        expect(payload.content).toContain('Run intent: maintenance');
        expect(payload.content).toContain('Config version: v11');
      },
    },
    {
      name: 'renders request ids as artifact fallback when no work item is bound',
      inputs: {
        request: {
          ...request,
          workItem: undefined,
        },
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordArtifactMessage(inputRequest),
      assert: (payload: ReturnType<typeof renderDiscordArtifactMessage>) => {
        expect(payload.content).toContain('Artifact: run-1');
      },
    },
    {
      name: 'renders failure explanation messages through the shared content structure',
      inputs: {
        request,
      },
      mock: ({ request: inputRequest }: { request: DiscordControlRequest }) =>
        renderDiscordFailureExplanationMessage(inputRequest),
      assert: (
        payload: ReturnType<typeof renderDiscordFailureExplanationMessage>,
      ) => {
        expect(payload.content).toContain('🔴 DevPlat · Failure explanation');
        expect(payload.content).toContain('Status: failed or blocked');
        expect(payload.content).toContain(
          'Reason: policy or gate failure requires operator review',
        );
        expect(payload.content).toContain(
          '→ Review details, then retry gates or remediate.',
        );
      },
    },
  ];

  it.each(cases)('$name', ({ inputs, mock, assert }) => {
    assert(mock(inputs));
  });
});
