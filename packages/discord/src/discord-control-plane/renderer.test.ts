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
    items: [{ token: 'token-array-sensitive' }, 'literal-event-value'],
    data: {
      name: 'run this',
      custom_id: 'devplat:v1:thread-sensitive:run-this',
      nestedApiKey: 'nested-api-key-sensitive',
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
        expect(
          payload.components?.[0]?.components.map((button) => button.label),
        ).toEqual(['Details', 'Show Status', 'Explain Failure']);
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
