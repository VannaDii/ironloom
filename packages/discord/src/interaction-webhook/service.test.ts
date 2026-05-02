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
import type {
  DiscordControlRequest,
  DiscordControlResult,
  DiscordInteractionCallbackOptions,
} from '../discord-control-plane/codec.js';
import { DiscordInteractionWebhookService } from './service.js';
import type { DiscordInteractionWebhookRequest } from './codec.js';

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

class LegacyWebhookControlPlane extends DiscordControlPlaneService {
  public constructor(private readonly failedClosedResult: boolean) {
    super();
  }

  public override handleInteraction(): Promise<DiscordControlResult> {
    const request = {
      id: 'legacy-interaction',
      summary: this.failedClosedResult
        ? 'Legacy interaction failed closed.'
        : 'Legacy webhook result.',
      status: this.failedClosedResult ? 'blocked' : 'running',
      trace: [],
      updatedAt: '2026-05-01T00:00:00.000Z',
      actorId: 'operator-legacy',
      threadId: 'thread-legacy',
      channelId: 'thread-legacy',
      action: 'show-status',
      privileged: false,
    } satisfies DiscordControlRequest;

    return Promise.resolve({
      request,
      policyDecisionId: 'legacy-policy',
      allowed: !this.failedClosedResult,
      persistedKey: request.id,
      failedClosed: this.failedClosedResult,
    });
  }
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
        expect(result.responseBody).toMatchObject({
          type: 4,
          data: {
            allowed_mentions: { parse: [] },
            content: expect.stringContaining('🟡 DevPlat · Gates retry queued'),
            components: expect.arrayContaining([
              expect.objectContaining({
                components: expect.arrayContaining([
                  expect.objectContaining({
                    custom_id: 'devplat:v1:show-status:thread-1',
                    label: 'Show Status',
                  }),
                ]),
              }),
            ]),
          },
        });
      },
    },
    {
      name: 'falls back to described control text when old control planes omit response payloads',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-legacy',
            token: 'token-legacy',
            channel_id: 'thread-legacy',
            data: {
              name: 'show-status',
            },
            user: {
              id: 'operator-legacy',
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
          new LegacyWebhookControlPlane(false),
          async () => inputs.options,
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(200);
        expect(result.responseBody).toMatchObject({
          data: {
            content: 'thread-legacy:show-status -> Legacy webhook result.',
          },
        });
      },
    },
    {
      name: 'falls back to failed-closed summaries when old control planes omit response payloads',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-legacy-blocked',
            token: 'token-legacy-blocked',
            channel_id: 'thread-legacy',
            data: {
              name: 'show-status',
            },
            user: {
              id: 'operator-legacy',
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
          new LegacyWebhookControlPlane(true),
          async () => inputs.options,
        );

        return service.handle(inputs.request);
      },
      assert: async (
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>,
      ) => {
        expect(result.statusCode).toBe(200);
        expect(result.responseBody).toMatchObject({
          data: {
            content: 'Legacy interaction failed closed.',
          },
        });
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
          type: 4,
          data: {
            allowed_mentions: { parse: [] },
            content: expect.stringContaining('🔴 DevPlat · Action refused'),
            components: expect.arrayContaining([
              expect.objectContaining({
                components: expect.arrayContaining([
                  expect.objectContaining({
                    custom_id: 'devplat:v1:show-last-artifact:unresolved',
                    label: 'Details',
                  }),
                ]),
              }),
            ]),
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
