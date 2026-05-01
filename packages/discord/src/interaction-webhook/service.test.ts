import { generateKeyPairSync, sign } from 'node:crypto';
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
import type { DiscordInteractionCallbackOptions } from '../discord-control-plane/types.js';
import { DiscordInteractionWebhookService } from './service.js';
import type { DiscordInteractionWebhookRequest } from './types.js';

function createSignedWebhookRequest(
  body: string,
): DiscordInteractionWebhookRequest {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const timestamp = '2026-05-01T00:00:00.000Z';
  const publicKeyDer = publicKey.export({
    format: 'der',
    type: 'spki',
  });
  const publicKeyHex = publicKeyDer
    .subarray(publicKeyDer.length - 32)
    .toString('hex');
  const signature = sign(
    null,
    Buffer.from(`${timestamp}${body}`),
    privateKey,
  ).toString('hex');

  return {
    body,
    publicKey: publicKeyHex,
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
  };
}

async function createControlPlane(): Promise<DiscordControlPlaneService> {
  const rootDirectory = await mkdtemp(
    join(tmpdir(), 'devplat-discord-webhook-'),
  );
  const store = new FileStoreService(rootDirectory);

  return new DiscordControlPlaneService(
    new DecisionPolicyService(),
    new TelemetryEventService(store),
    store,
    new DiscordLoopbackResponseTransport(),
  );
}

describe('DiscordInteractionWebhookService', () => {
  const cases = [
    {
      name: 'responds to Discord pings without invoking the control plane',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            type: 1,
          }),
        ),
        options: {},
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionWebhookService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(200);
        expect(result.verified).toBe(true);
        expect(result.handled).toBe(false);
        expect(result.responseBody).toEqual({ type: 1 });
      },
    },
    {
      name: 'routes verified slash command callbacks through the control plane',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-1',
            token: 'token-1',
            channel_id: 'thread-1',
            data: {
              name: 'retry-gates',
            },
            member: {
              user: {
                id: 'operator-1',
              },
            },
          }),
        ),
        options: {
          threadId: 'thread-1',
          summary: 'Retry gates from webhook.',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionWebhookService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(200);
        expect(result.verified).toBe(true);
        expect(result.handled).toBe(true);
        expect(result.persistedKey).toBe('interaction-1');
        expect(result.threadId).toBe('thread-1');
      },
    },
    {
      name: 'rejects invalid signatures before routing',
      inputs: {
        request: {
          ...createSignedWebhookRequest(
            JSON.stringify({
              id: 'interaction-2',
              token: 'token-2',
              channel_id: 'thread-2',
            }),
          ),
          body: JSON.stringify({
            id: 'interaction-3',
            token: 'token-2',
            channel_id: 'thread-2',
          }),
        },
        options: {},
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionWebhookService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(401);
        expect(result.verified).toBe(false);
        expect(result.handled).toBe(false);
      },
    },
    {
      name: 'fails closed for malformed verified payloads',
      inputs: {
        request: createSignedWebhookRequest('{'),
        options: {},
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionWebhookService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(400);
        expect(result.verified).toBe(true);
        expect(result.handled).toBe(false);
        expect(result.error).toContain('valid JSON');
      },
    },
    {
      name: 'uses the default binding resolver when a control plane is supplied',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-default-binding',
            token: 'token-default-binding',
            channel_id: 'thread-default-binding',
            data: {
              name: 'show-status',
            },
            user: {
              id: 'operator-default-binding',
            },
          }),
        ),
        options: {},
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionWebhookService(
          await createControlPlane(),
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(200);
        expect(result.verified).toBe(true);
        expect(result.handled).toBe(true);
        expect(result.threadId).toBe('thread-default-binding');
      },
    },
    {
      name: 'returns fail-closed summaries for ambiguous thread bindings',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-ambiguous-binding',
            token: 'token-ambiguous-binding',
            channel_id: 'thread-a',
            data: {
              name: 'show-status',
            },
            user: {
              id: 'operator-ambiguous-binding',
            },
          }),
        ),
        options: {
          boundThreadId: 'thread-b',
          summary: 'Ambiguous thread binding.',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionWebhookService(
          await createControlPlane(),
          async () => inputs.options,
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(200);
        expect(result.verified).toBe(true);
        expect(result.handled).toBe(true);
        expect(result.threadId).toBe('unresolved');
        expect(result.responseBody).toMatchObject({
          data: {
            content:
              'Discord interaction must resolve to exactly one bound thread.',
          },
        });
      },
    },
    {
      name: 'uses default local dependencies before rejecting invalid signatures',
      inputs: {
        request: {
          ...createSignedWebhookRequest(
            JSON.stringify({
              id: 'interaction-default-service',
              token: 'token-default-service',
              channel_id: 'thread-default-service',
            }),
          ),
          publicKey: 'invalid',
        },
        options: {},
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const service = new DiscordInteractionWebhookService();

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(401);
        expect(result.verified).toBe(false);
        expect(result.handled).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    await testCase.assert(result);
  });
});
