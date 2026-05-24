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
  DiscordOperatorInteraction,
} from '../discord-control-plane/codec.js';
import {
  DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
  DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
} from '../discord-control-plane/constants.js';
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

class NeverSettlingAcknowledgedControlPlane extends DiscordControlPlaneService {
  public acknowledgedInteractions: DiscordOperatorInteraction[] = [];

  public constructor() {
    super();
  }

  public override handleAcknowledgedInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    this.acknowledgedInteractions.push(input);

    return new Promise(() => undefined);
  }

  public override handleInteraction(): Promise<DiscordControlResult> {
    return Promise.reject(
      new Error('Slow webhook test must not call the Gateway-style handler.'),
    );
  }
}

class RecordingAcknowledgedControlPlane extends DiscordControlPlaneService {
  public acknowledgedInteractions: DiscordOperatorInteraction[] = [];

  public constructor(private readonly failedClosedResult: boolean) {
    super();
  }

  public override handleAcknowledgedInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    this.acknowledgedInteractions.push(input);
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

  public override handleInteraction(): Promise<DiscordControlResult> {
    return Promise.reject(
      new Error('Webhook service must not call the Gateway-style handler.'),
    );
  }
}

class RejectingAcknowledgedControlPlane extends DiscordControlPlaneService {
  public acknowledgedInteractions: DiscordOperatorInteraction[] = [];

  public constructor() {
    super();
  }

  public override handleAcknowledgedInteraction(
    input: DiscordOperatorInteraction,
  ): Promise<DiscordControlResult> {
    this.acknowledgedInteractions.push(input);

    return Promise.reject(new Error('Detached webhook work failed.'));
  }

  public override handleInteraction(): Promise<DiscordControlResult> {
    return Promise.reject(
      new Error(
        'Detached webhook test must not call the Gateway-style handler.',
      ),
    );
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
      name: 'acks verified slash command callbacks before durable control work',
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
        const backgroundTasks: Array<() => Promise<DiscordControlResult>> = [];
        const service = new DiscordInteractionWebhookService(
          await createControlPlane(),
          async () => inputs.options,
          (task) => {
            backgroundTasks.push(task);
          },
        );

        return {
          backgroundTasks,
          result: await service.handle(inputs.request),
        };
      },
      assert: async (context: {
        backgroundTasks: Array<() => Promise<DiscordControlResult>>;
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>;
      }) => {
        const { backgroundTasks, result } = context;
        expect(result.statusCode).toBe(200);
        expect(result.verified).toBe(true);
        expect(result.handled).toBe(true);
        expect(result.persistedKey).toBe('interaction-1');
        expect(result.threadId).toBe('thread-1');
        expect(result.responseBody).toEqual({
          type: DISCORD_INTERACTION_DEFERRED_RESPONSE_TYPE,
          data: {
            flags: 64,
          },
        });
        expect(backgroundTasks).toHaveLength(1);

        const [backgroundTask] = backgroundTasks;
        if (backgroundTask === undefined) {
          throw new Error('Expected queued Discord webhook background task.');
        }
        const durableResult = await backgroundTask();
        expect(durableResult).toMatchObject({
          allowed: true,
          persistedKey: 'interaction-1',
          request: {
            threadId: 'thread-1',
          },
          threadPayload: {
            allowed_mentions: { parse: [] },
            content: expect.stringContaining('🟡 DevPlat · Gates retry queued'),
          },
        });
      },
    },
    {
      name: 'acks component callbacks with deferred message update responses',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-component',
            token: 'token-component',
            channel_id: 'thread-component',
            data: {
              custom_id: 'devplat:v1:show-status:thread-component',
            },
            user: {
              id: 'operator-component',
            },
          }),
        ),
        options: {
          threadId: 'thread-component',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const controlPlane = new RecordingAcknowledgedControlPlane(false);
        const backgroundTasks: Array<() => Promise<DiscordControlResult>> = [];
        const service = new DiscordInteractionWebhookService(
          controlPlane,
          async () => inputs.options,
          (task) => {
            backgroundTasks.push(task);
          },
        );

        return {
          backgroundTasks,
          controlPlane,
          result: await service.handle(inputs.request),
        };
      },
      assert: async (context: {
        backgroundTasks: Array<() => Promise<DiscordControlResult>>;
        controlPlane: RecordingAcknowledgedControlPlane;
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>;
      }) => {
        expect(context.result).toMatchObject({
          handled: true,
          persistedKey: 'interaction-component',
          responseBody: {
            type: DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
          },
          statusCode: 200,
          threadId: 'thread-component',
        });
        expect(context.backgroundTasks).toHaveLength(1);

        const [backgroundTask] = context.backgroundTasks;
        if (backgroundTask === undefined) {
          throw new Error('Expected queued Discord webhook background task.');
        }
        await backgroundTask();
        expect(context.controlPlane.acknowledgedInteractions).toHaveLength(1);
        const [acknowledgedInteraction] =
          context.controlPlane.acknowledgedInteractions;
        if (acknowledgedInteraction === undefined) {
          throw new Error('Expected acknowledged Discord webhook interaction.');
        }
        expect(acknowledgedInteraction).toMatchObject({
          customId: 'devplat:v1:show-status:thread-component',
          id: 'interaction-component',
        });
      },
    },
    {
      name: 'does not wait for durable control work before returning Discord ACK',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-slow-component',
            token: 'token-slow-component',
            channel_id: 'thread-slow-component',
            data: {
              custom_id: 'devplat:v1:show-status:thread-slow-component',
            },
            user: {
              id: 'operator-slow-component',
            },
          }),
        ),
        options: {
          threadId: 'thread-slow-component',
        },
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const controlPlane = new NeverSettlingAcknowledgedControlPlane();
        const service = new DiscordInteractionWebhookService(
          controlPlane,
          async () => inputs.options,
          (task) => {
            void task();
          },
        );

        return {
          controlPlane,
          result: await service.handle(inputs.request),
        };
      },
      assert: async (context: {
        controlPlane: NeverSettlingAcknowledgedControlPlane;
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>;
      }) => {
        expect(context.result).toMatchObject({
          handled: true,
          responseBody: {
            type: DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
          },
          statusCode: 200,
        });
        expect(context.controlPlane.acknowledgedInteractions).toHaveLength(1);
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
      name: 'detaches default background work failures after immediate component acknowledgement',
      inputs: {
        request: createSignedWebhookRequest(
          JSON.stringify({
            id: 'interaction-detached-failure',
            token: 'token-detached-failure',
            channel_id: 'thread-detached-failure',
            data: {
              custom_id: 'devplat:v1:show-status:thread-detached-failure',
            },
            user: {
              id: 'operator-detached-failure',
            },
          }),
        ),
        options: {
          threadId: 'thread-detached-failure',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      mock: async (inputs: {
        request: DiscordInteractionWebhookRequest;
        options: DiscordInteractionCallbackOptions;
      }) => {
        const controlPlane = new RejectingAcknowledgedControlPlane();
        const service = new DiscordInteractionWebhookService(
          controlPlane,
          async () => inputs.options,
        );
        const result = await service.handle(inputs.request);
        await Promise.resolve();

        return {
          controlPlane,
          result,
        };
      },
      assert: async (context: {
        controlPlane: RejectingAcknowledgedControlPlane;
        result: Awaited<ReturnType<DiscordInteractionWebhookService['handle']>>;
      }) => {
        expect(context.result).toMatchObject({
          handled: true,
          responseBody: {
            type: DISCORD_INTERACTION_DEFERRED_UPDATE_RESPONSE_TYPE,
          },
          statusCode: 200,
          threadId: 'thread-detached-failure',
        });
        expect(context.controlPlane.acknowledgedInteractions).toHaveLength(1);
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
        expect(result.responseBody.type).toBe(4);
        expect(result.responseBody.data.content).toContain(
          'Reason: project/thread context mismatch: expected=thread-b detected=thread-a,thread-b. Recovery: /open-project --repo <repo_name> --project <project_name> --intent maintenance|bugfix|new-feature',
        );
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
