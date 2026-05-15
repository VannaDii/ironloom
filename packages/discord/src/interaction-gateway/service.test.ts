import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';
import {
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
} from '@vannadii/devplat-core';

import {
  DiscordControlPlaneService,
  DiscordLoopbackResponseTransport,
  type DiscordControlResponseTransport,
} from '../discord-control-plane/service.js';
import { renderDiscordActionComponentRows } from '../discord-control-plane/renderer.js';
import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordInteractionCallbackOptions,
  DiscordResponseReceipt,
} from '../discord-control-plane/codec.js';
import { DiscordInteractionGatewayService } from './service.js';
import type { DiscordGatewayDispatchEvent } from './codec.js';

async function createControlPlane(): Promise<DiscordControlPlaneService> {
  const rootDirectory = await mkdtemp(
    join(tmpdir(), 'devplat-discord-gateway-'),
  );
  const store = new FileStoreService(rootDirectory);

  return new DiscordControlPlaneService(
    new DecisionPolicyService(),
    new TelemetryEventService(store),
    store,
    new DiscordLoopbackResponseTransport(),
  );
}

/**
 * Creates a deterministic Discord response receipt for Gateway interaction tests.
 */
function createDiscordGatewayReceipt(
  endpoint: string,
  statusCode: number,
): DiscordResponseReceipt {
  return {
    endpoint,
    statusCode,
    responseBody: { ok: true },
  };
}

/**
 * Creates a response transport that records Gateway ACK and message ordering.
 */
function createObservedDiscordGatewayTransport(
  events: string[],
): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      events.push(`response:${input.id}`);
      return createDiscordGatewayReceipt(
        `/interactions/${input.id}/${input.token}/callback`,
        200,
      );
    },
    async postInteractionDeferred(input) {
      events.push(`deferred:${input.id}`);
      return createDiscordGatewayReceipt(
        `/interactions/${input.id}/${input.token}/callback`,
        204,
      );
    },
    async postInteractionCompletion(input) {
      events.push(`completion:${input.id}`);
      return createDiscordGatewayReceipt(
        `/webhooks/application/${input.token}`,
        200,
      );
    },
    async postThreadMessage(threadId, payload) {
      events.push(`thread:${threadId}:${payload.content}`);
      return createDiscordGatewayReceipt(`/channels/${threadId}/messages`, 200);
    },
  };
}

/**
 * Renders representative operator buttons and extracts the clickable custom ids.
 */
function createRenderedButtonCases(request: DiscordControlRequest): Array<{
  readonly action: DiscordControlAction;
  readonly customId: string;
  readonly expectedTitle: string;
  readonly label: string;
}> {
  const expectedActions = new Map<
    string,
    { readonly action: DiscordControlAction; readonly title: string }
  >([
    [
      DEVPLAT_ACTION_EXPLAIN_FAILURE,
      {
        action: DEVPLAT_ACTION_EXPLAIN_FAILURE,
        title: 'DevPlat · Failure explanation',
      },
    ],
    [
      DEVPLAT_ACTION_RETRY_GATES,
      {
        action: DEVPLAT_ACTION_RETRY_GATES,
        title: 'DevPlat · Gates retry queued',
      },
    ],
    [
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
      {
        action: DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
        title: 'DevPlat · Last artifact',
      },
    ],
    [
      DEVPLAT_ACTION_SHOW_STATUS,
      {
        action: DEVPLAT_ACTION_SHOW_STATUS,
        title: 'DevPlat · Status',
      },
    ],
  ]);
  const rows = renderDiscordActionComponentRows(request, [
    DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    DEVPLAT_ACTION_SHOW_STATUS,
    DEVPLAT_ACTION_EXPLAIN_FAILURE,
    DEVPLAT_ACTION_RETRY_GATES,
  ]);

  return rows.flatMap((row) =>
    row.components.flatMap((button) => {
      const actionToken = button.custom_id?.split(':').at(2);
      const expected =
        actionToken === undefined
          ? undefined
          : expectedActions.get(actionToken);
      if (expected === undefined || button.custom_id === undefined) {
        return [];
      }

      return [
        {
          action: expected.action,
          customId: button.custom_id,
          expectedTitle: expected.title,
          label: button.label,
        },
      ];
    }),
  );
}

/**
 * Builds a Gateway dispatch event that matches Discord component interactions.
 */
function createRenderedButtonDispatchEvent({
  customId,
  index,
  threadId,
}: {
  customId: string;
  index: number;
  threadId: string;
}): DiscordGatewayDispatchEvent {
  return {
    op: 0,
    t: 'INTERACTION_CREATE',
    s: index,
    d: {
      id: `gateway-rendered-button-${String(index)}`,
      token: `gateway-rendered-button-token-${String(index)}`,
      channel_id: threadId,
      data: {
        custom_id: customId,
      },
      member: {
        user: {
          id: 'operator-rendered-button',
        },
      },
    },
  };
}

describe('DiscordInteractionGatewayService', () => {
  const cases = [
    {
      name: 'ignores non-interaction gateway dispatches',
      inputs: {
        event: {
          op: 0,
          t: 'READY',
          s: 1,
          d: {
            session_id: 'session-1',
          },
        },
        options: {},
      },
      mock: async (inputs: {
        event: DiscordGatewayDispatchEvent;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionGatewayService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handleDispatch(inputs.event);
      },
      assert: async (
        result: Awaited<
          ReturnType<DiscordInteractionGatewayService['handleDispatch']>
        >,
      ) => {
        expect(result).toEqual({
          status: 'ignored',
          eventName: 'READY',
        });
      },
    },
    {
      name: 'routes interaction gateway dispatches through the control plane',
      inputs: {
        event: {
          op: 0,
          t: 'INTERACTION_CREATE',
          s: 2,
          d: {
            id: 'gateway-interaction-1',
            token: 'gateway-token-1',
            channel_id: 'thread-1',
            data: {
              custom_id: 'devplat:v1:retry-gates:thread-1',
            },
            member: {
              user: {
                id: 'operator-1',
              },
            },
          },
        },
        options: {
          boundThreadId: 'thread-1',
          summary: 'Retry gates from Discord Gateway.',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      mock: async (inputs: {
        event: DiscordGatewayDispatchEvent;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionGatewayService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handleDispatch(inputs.event);
      },
      assert: async (
        result: Awaited<
          ReturnType<DiscordInteractionGatewayService['handleDispatch']>
        >,
      ) => {
        expect(result.status).toBe('handled');
        expect(result).toMatchObject({
          interactionId: 'gateway-interaction-1',
          threadId: 'thread-1',
          controlResult: {
            allowed: true,
            responsePayload: {
              content: expect.stringContaining(
                '🟡 DevPlat · Gates retry queued',
              ),
            },
          },
        });
      },
    },
    {
      name: 'uses default binding resolution when only a control plane is supplied',
      inputs: {
        event: {
          op: 0,
          t: 'INTERACTION_CREATE',
          s: 3,
          d: {
            id: 'gateway-interaction-default',
            token: 'gateway-token-default',
            channel_id: 'thread-default',
            data: {
              name: 'show-status',
            },
            user: {
              id: 'operator-default',
            },
          },
        },
        options: {},
      },
      mock: async (inputs: {
        event: DiscordGatewayDispatchEvent;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionGatewayService(
          await createControlPlane(),
        );

        return service.handleDispatch(inputs.event);
      },
      assert: async (
        result: Awaited<
          ReturnType<DiscordInteractionGatewayService['handleDispatch']>
        >,
      ) => {
        expect(result).toMatchObject({
          status: 'handled',
          interactionId: 'gateway-interaction-default',
          threadId: 'thread-default',
        });
      },
    },
    {
      name: 'rejects malformed interaction gateway dispatches before routing',
      inputs: {
        event: {
          op: 0,
          t: 'INTERACTION_CREATE',
          d: {
            id: 'gateway-interaction-2',
          },
        },
        options: {},
      },
      mock: async (inputs: {
        event: DiscordGatewayDispatchEvent;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionGatewayService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handleDispatch(inputs.event);
      },
      assert: async (
        result: Awaited<
          ReturnType<DiscordInteractionGatewayService['handleDispatch']>
        >,
      ) => {
        expect(result.status).toBe('rejected');
        expect(result).toMatchObject({
          eventName: 'INTERACTION_CREATE',
          reason: expect.stringContaining('supported interaction callback'),
        });
      },
    },
    {
      name: 'acks rendered Discord button interactions through Gateway before posting action results',
      inputs: {
        request: {
          id: 'rendered-button-source',
          summary: 'Rendered button source',
          status: 'accepted',
          trace: [],
          updatedAt: '2026-05-01T00:00:00.000Z',
          actorId: 'operator-rendered-button',
          threadId: 'thread-rendered-button',
          channelId: 'thread-rendered-button',
          action: DEVPLAT_ACTION_SHOW_STATUS,
          privileged: false,
          workItem: {
            threadKind: 'implementation',
            threadId: 'thread-rendered-button',
            artifactId: 'artifact-rendered-button',
            sliceId: 'slice-rendered-button',
          },
        } satisfies DiscordControlRequest,
        options: {
          boundThreadId: 'thread-rendered-button',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      mock: async (inputs: {
        request: DiscordControlRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-buttons-'),
        );
        const store = new FileStoreService(rootDirectory);
        const events: string[] = [];
        const service = new DiscordInteractionGatewayService(
          new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createObservedDiscordGatewayTransport(events),
          ),
          async () => inputs.options,
        );
        const buttonCases = createRenderedButtonCases(inputs.request);
        const results: Awaited<
          ReturnType<DiscordInteractionGatewayService['handleDispatch']>
        >[] = [];
        for (const [index, buttonCase] of buttonCases.entries()) {
          results.push(
            await service.handleDispatch(
              createRenderedButtonDispatchEvent({
                customId: buttonCase.customId,
                index,
                threadId: inputs.request.threadId,
              }),
            ),
          );
        }

        return {
          buttonCases,
          events,
          results,
        };
      },
      assert: async (context: {
        buttonCases: Array<{
          readonly action: DiscordControlAction;
          readonly customId: string;
          readonly expectedTitle: string;
          readonly label: string;
        }>;
        events: string[];
        results: Awaited<
          ReturnType<DiscordInteractionGatewayService['handleDispatch']>
        >[];
      }) => {
        expect(
          context.buttonCases.map((buttonCase) => buttonCase.label),
        ).toEqual(['Details', 'Show Status', 'Explain Failure', 'Retry Gates']);
        for (const [index, result] of context.results.entries()) {
          const buttonCase = context.buttonCases[index];
          if (buttonCase === undefined) {
            throw new Error(
              'Expected rendered button case for Gateway result.',
            );
          }

          expect(result).toMatchObject({
            status: 'handled',
            interactionId: `gateway-rendered-button-${String(index)}`,
            threadId: 'thread-rendered-button',
            controlResult: {
              allowed: true,
              request: {
                action: buttonCase.action,
                threadId: 'thread-rendered-button',
              },
              responseReceipt: {
                statusCode: 204,
              },
              threadReceipt: {
                endpoint: '/channels/thread-rendered-button/messages',
                statusCode: 200,
              },
              responsePayload: {
                content: expect.stringContaining(buttonCase.expectedTitle),
              },
            },
          });
          const deferredIndex = context.events.indexOf(
            `deferred:gateway-rendered-button-${String(index)}`,
          );
          const threadIndex = context.events.findIndex(
            (event) =>
              event.startsWith('thread:thread-rendered-button:') &&
              event.includes(buttonCase.expectedTitle),
          );
          expect(deferredIndex).toBeGreaterThanOrEqual(0);
          expect(threadIndex).toBeGreaterThanOrEqual(0);
          expect(deferredIndex).toBeLessThan(threadIndex);
          expect(context.events).not.toContain(
            `completion:gateway-rendered-button-${String(index)}`,
          );
        }
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    await testCase.assert(result);
  });
});
