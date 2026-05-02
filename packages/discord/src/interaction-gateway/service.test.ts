import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  DiscordControlPlaneService,
  DiscordLoopbackResponseTransport,
} from '../discord-control-plane/service.js';
import type { DiscordInteractionCallbackOptions } from '../discord-control-plane/codec.js';
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
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    await testCase.assert(result);
  });
});
