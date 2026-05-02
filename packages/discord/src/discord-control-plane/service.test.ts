import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';
import type { StoredRecord } from '@vannadii/devplat-storage';

import {
  DiscordControlPlaneService,
  DiscordLoopbackResponseTransport,
  DiscordRestResponseTransport,
  type DiscordControlResponseTransport,
} from './service.js';
import type {
  DiscordMessagePayload,
  DiscordOperatorInteraction,
  DiscordResponseReceipt,
} from './codec.js';

function createReceipt(endpoint: string): DiscordResponseReceipt {
  return {
    endpoint,
    statusCode: 200,
    responseBody: { ok: true },
  };
}

function createMessagePayload(content: string): DiscordMessagePayload {
  return {
    content,
  };
}

function createResponseTransport(): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionDeferred(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postThreadMessage(threadId) {
      return createReceipt(`/channels/${threadId}/messages`);
    },
  };
}

/**
 * Test store that records persistence order without changing file-store behavior.
 */
class ObservedFileStoreService extends FileStoreService {
  /**
   * Creates a store rooted at a temporary directory with shared event capture.
   */
  public constructor(
    rootDirectory: string,
    private readonly events: string[],
  ) {
    super(rootDirectory);
  }

  /**
   * Records store ordering before delegating to the real file-backed store.
   */
  public override async store<TPayload extends object>(
    record: StoredRecord<TPayload>,
  ): Promise<StoredRecord<TPayload>> {
    this.events.push(`store:${record.scope}:${record.key}`);
    return super.store(record);
  }
}

/**
 * Creates a transport that records response ordering for interaction tests.
 */
function createObservedResponseTransport(
  events: string[],
): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      events.push(`interaction-response:${input.id}`);
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionDeferred(input) {
      events.push(`interaction-deferred:${input.id}`);
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postThreadMessage(threadId) {
      events.push(`thread-message:${threadId}`);
      return createReceipt(`/channels/${threadId}/messages`);
    },
  };
}

describe('DiscordControlPlaneService', () => {
  it('records thread-aware control actions with policy enforcement', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-001',
      summary: 'retry gates',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-1',
      threadId: 'thread-1',
      channelId: 'channel-1',
      action: 'retry-gates',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.persistedKey).toBe('discord-001');
    expect(await store.list('audit')).toContain('discord-001:audit');
  });

  it('blocks privileged merge actions and exposes helper methods', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const prepared = service.execute({
      id: 'discord-002',
      summary: '  merge now  ',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-2',
      threadId: 'thread-2',
      channelId: 'channel-2',
      action: 'merge-now',
      privileged: true,
    });
    const result = await service.handleAction(prepared);

    expect(service.explain(prepared)).toContain('thread-2:merge-now');
    expect(result.allowed).toBe(false);
    expect(await store.list('state')).toContain('discord-002');
    expect(await store.list('audit')).toContain('discord-002:audit');
  });

  it('records thread-aware diagnostic actions without privileged overrides', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-003',
      summary: 'show status',
      status: 'review',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-3',
      threadId: 'thread-3',
      channelId: 'channel-3',
      action: 'show-status',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(await store.list('telemetry')).toContain('discord-003');
  });

  it('fails closed for risky worktree release actions without an approval override', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004',
      summary: 'release worktree',
      status: 'review',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4',
      threadId: 'thread-4',
      channelId: 'channel-4',
      action: 'release-worktree',
      privileged: false,
    });

    expect(result.allowed).toBe(false);
    expect(await store.list('state')).toContain('discord-004');
  });

  it('handles Discord interactions through responses and thread updates', async () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction-001',
            token: 'token-1',
            actorId: 'user-5',
            channelId: 'channel-5',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-5',
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
          const store = new FileStoreService(rootDirectory);
          return {
            store,
            service: new DiscordControlPlaneService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              store,
              createResponseTransport(),
            ),
          };
        },
        assert: async (context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        }) => {
          const result = await context.service.handleInteraction(
            cases[0].inputs.interaction,
          );

          expect(result.allowed).toBe(true);
          expect(result.failedClosed).toBe(false);
          expect(result.responseReceipt?.endpoint).toBe(
            '/interactions/interaction-001/token-1/callback',
          );
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-5/messages',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-001',
          );
        },
      },
      {
        inputs: {
          interaction: {
            id: 'interaction-001b',
            token: 'token-1b',
            actorId: 'user-5b',
            channelId: 'channel-5b',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            boundSession: {
              id: 'thread-session-001b',
              summary: 'Pull request session',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-5b',
              channelId: 'thread-5b',
              parentChannelId: 'pull-request-channel',
              threadId: 'thread-5b',
              kind: 'pull-request',
              specId: 'spec-5b',
              sliceId: 'slice-5b',
              pullRequestNumber: 42,
              artifactId: 'artifact-5b',
            },
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
          const store = new FileStoreService(rootDirectory);
          const messages: string[] = [];
          return {
            messages,
            store,
            service: new DiscordControlPlaneService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              store,
              {
                async postInteractionResponse(input, payload) {
                  messages.push(payload.content);
                  return createReceipt(
                    `/interactions/${input.id}/${input.token}/callback`,
                  );
                },
                async postInteractionDeferred(input) {
                  return createReceipt(
                    `/interactions/${input.id}/${input.token}/callback`,
                  );
                },
                async postThreadMessage(threadId, payload) {
                  messages.push(payload.content);
                  return createReceipt(`/channels/${threadId}/messages`);
                },
              },
            ),
          };
        },
        assert: async (context: {
          messages: string[];
          store: FileStoreService;
          service: DiscordControlPlaneService;
        }) => {
          const result = await context.service.handleInteraction(
            cases[1].inputs.interaction,
          );

          expect(result.allowed).toBe(true);
          expect(result.workItem).toMatchObject({
            threadKind: 'pull-request',
            pullRequestNumber: 42,
            artifactId: 'artifact-5b',
          });
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-5b/messages',
          );
          expect(context.messages.join('\n')).toContain('pull-request #42');
          expect(await context.store.list('state')).toContain(
            'interaction-001b',
          );
        },
      },
    ];

    for (const testCase of cases) {
      const context = await testCase.mock();
      await testCase.assert(context);
    }
  });

  const cases = [
    {
      name: 'acknowledges accepted interaction before persistence',
      inputs: {
        interaction: {
          id: 'interaction-ack-001',
          token: 'token-ack-1',
          actorId: 'user-ack-1',
          channelId: 'channel-ack-1',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          threadId: 'thread-ack-1',
        } satisfies DiscordOperatorInteraction,
        expectedAllowed: true,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const events: string[] = [];
        const store = new ObservedFileStoreService(rootDirectory, events);
        return {
          events,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createObservedResponseTransport(events),
          ),
        };
      },
      assert: async (
        context: {
          events: string[];
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
          expectedAllowed: boolean;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(inputs.expectedAllowed);
        expect(context.events[0]).toBe(
          'interaction-response:interaction-ack-001',
        );
        expect(context.events).toContain('store:state:interaction-ack-001');
        expect(context.events).toContain('thread-message:thread-ack-1');
      },
    },
    {
      name: 'acknowledges blocked interaction before persistence',
      inputs: {
        interaction: {
          id: 'interaction-ack-002',
          token: 'token-ack-2',
          actorId: 'user-ack-2',
          channelId: 'channel-ack-2',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'release worktree',
          threadId: 'thread-ack-2',
        } satisfies DiscordOperatorInteraction,
        expectedAllowed: false,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const events: string[] = [];
        const store = new ObservedFileStoreService(rootDirectory, events);
        return {
          events,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createObservedResponseTransport(events),
          ),
        };
      },
      assert: async (
        context: {
          events: string[];
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
          expectedAllowed: boolean;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(inputs.expectedAllowed);
        expect(context.events[0]).toBe(
          'interaction-response:interaction-ack-002',
        );
        expect(context.events).toContain('store:state:interaction-ack-002');
        expect(context.events).toContain('thread-message:thread-ack-2');
      },
    },
  ];

  it.each(cases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock();
    await assert(context, inputs);
  });

  it('fails closed and responds when Discord thread binding is ambiguous', async () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction-002',
            token: 'token-2',
            actorId: 'user-6',
            channelId: 'channel-6',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'merge now',
            threadId: 'thread-6',
            boundThreadId: 'thread-7',
            privileged: true,
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
          const store = new FileStoreService(rootDirectory);
          return {
            store,
            service: new DiscordControlPlaneService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              store,
              createResponseTransport(),
            ),
          };
        },
        assert: async (context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        }) => {
          const result = await context.service.handleInteraction(
            cases[0].inputs.interaction,
          );

          expect(result.allowed).toBe(false);
          expect(result.failedClosed).toBe(true);
          expect(result.responseReceipt?.endpoint).toBe(
            '/interactions/interaction-002/token-2/callback',
          );
          expect(await context.store.list('state')).not.toContain(
            'interaction-002',
          );
          expect(await context.store.list('audit')).toContain(
            'interaction-002:audit',
          );
        },
      },
    ];

    for (const testCase of cases) {
      const context = await testCase.mock();
      await testCase.assert(context);
    }
  });

  it('posts Discord REST interaction and thread responses', async () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction-003',
            token: 'token-3',
            actorId: 'user-7',
            channelId: 'channel-7',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-7',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => {
          const calls: string[] = [];
          const bodies: string[] = [];
          const fetchImpl = async (
            url: string,
            init?: RequestInit,
          ): Promise<Response> => {
            calls.push(url);
            bodies.push(String(init?.body ?? ''));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          };
          return {
            bodies,
            calls,
            transport: new DiscordRestResponseTransport(
              'bot-token',
              'https://discord.test/api/v10',
              fetchImpl,
            ),
          };
        },
        assert: async (context: {
          bodies: string[];
          calls: string[];
          transport: DiscordRestResponseTransport;
        }) => {
          const interactionReceipt =
            await context.transport.postInteractionResponse(
              cases[0].inputs.interaction,
              {
                allowed_mentions: { parse: [] },
                content: 'accepted',
                flags: 64,
              },
            );
          const threadReceipt = await context.transport.postThreadMessage(
            'thread-7',
            {
              components: [
                {
                  components: [
                    {
                      custom_id: 'devplat:v1:show-status:thread-7',
                      label: 'Show Status',
                      style: 2,
                      type: 2,
                    },
                  ],
                  type: 1,
                },
              ],
              content: 'accepted',
            },
          );

          expect(interactionReceipt.endpoint).toBe(
            '/interactions/interaction-003/token-3/callback',
          );
          expect(threadReceipt.endpoint).toBe('/channels/thread-7/messages');
          expect(context.calls).toEqual([
            'https://discord.test/api/v10/interactions/interaction-003/token-3/callback',
            'https://discord.test/api/v10/channels/thread-7/messages',
          ]);
          expect(context.bodies).toEqual([
            JSON.stringify({
              type: 4,
              data: {
                content: 'accepted',
                allowed_mentions: { parse: [] },
                flags: 64,
              },
            }),
            JSON.stringify({
              content: 'accepted',
              components: [
                {
                  components: [
                    {
                      custom_id: 'devplat:v1:show-status:thread-7',
                      label: 'Show Status',
                      style: 2,
                      type: 2,
                    },
                  ],
                  type: 1,
                },
              ],
            }),
          ]);
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context);
    }
  });

  it('handles empty Discord REST response bodies', async () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction-004',
            token: 'token-4',
            actorId: 'user-8',
            channelId: 'channel-8',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-8',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => {
          const fetchImpl = async (): Promise<Response> =>
            new Response('', { status: 200 });
          return new DiscordRestResponseTransport(
            'bot-token',
            'https://discord.test/api/v10',
            fetchImpl,
          );
        },
        assert: async (transport: DiscordRestResponseTransport) => {
          const receipt = await transport.postInteractionResponse(
            cases[0].inputs.interaction,
            createMessagePayload('accepted'),
          );

          expect(receipt.statusCode).toBe(200);
          expect(receipt.responseBody).toBeNull();
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock());
    }
  });

  it('returns loopback receipts for hermetic interaction probes', async () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction-006',
            token: 'token-6',
            actorId: 'user-10',
            channelId: 'channel-10',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-10',
          },
          threadId: 'thread/10',
        },
        mock: () => new DiscordLoopbackResponseTransport(),
        assert: async (
          transport: DiscordLoopbackResponseTransport,
          inputs: {
            interaction: DiscordOperatorInteraction;
            threadId: string;
          },
        ) => {
          const responseReceipt = await transport.postInteractionResponse(
            inputs.interaction,
            createMessagePayload('Accepted.'),
          );
          const threadReceipt = await transport.postThreadMessage(
            inputs.threadId,
            createMessagePayload('DevPlat accepted.'),
          );
          const deferredReceipt = await transport.postInteractionDeferred(
            inputs.interaction,
          );

          expect(responseReceipt).toMatchObject({
            endpoint: '/interactions/interaction-006/token-6/callback',
            statusCode: 200,
            responseBody: {
              mode: 'loopback',
              content: 'Accepted.',
              interactionId: 'interaction-006',
            },
          });
          expect(threadReceipt).toMatchObject({
            endpoint: '/channels/thread%2F10/messages',
            responseBody: {
              mode: 'loopback',
              content: 'DevPlat accepted.',
              threadId: 'thread/10',
            },
          });
          expect(deferredReceipt).toMatchObject({
            endpoint: '/interactions/interaction-006/token-6/callback',
            responseBody: {
              deferred: true,
              interactionId: 'interaction-006',
              mode: 'loopback',
            },
          });
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock(), testCase.inputs);
    }
  });

  it('posts blocked action responses to the bound thread', async () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction-005',
            token: 'token-5',
            actorId: 'user-9',
            channelId: 'channel-9',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release worktree',
            threadId: 'thread-9',
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
          const store = new FileStoreService(rootDirectory);
          return {
            service: new DiscordControlPlaneService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              store,
              createResponseTransport(),
            ),
          };
        },
        assert: async (context: { service: DiscordControlPlaneService }) => {
          const result = await context.service.handleInteraction(
            cases[0].inputs.interaction,
          );

          expect(result.allowed).toBe(false);
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-9/messages',
          );
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(await testCase.mock());
    }
  });

  it('requires a Discord bot token before posting thread messages', async () => {
    const cases = [
      {
        inputs: {
          threadId: 'thread-8',
        },
        mock: () =>
          new DiscordRestResponseTransport('', 'https://discord.test/api/v10'),
        assert: async (transport: DiscordRestResponseTransport) => {
          await expect(
            transport.postThreadMessage(
              cases[0].inputs.threadId,
              createMessagePayload('blocked'),
            ),
          ).rejects.toThrow('DISCORD_BOT_TOKEN');
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock());
    }
  });

  it('posts Discord REST responses and rejects missing bot tokens for thread messages', async () => {
    const cases = [
      {
        inputs: {
          interaction: {
            id: 'interaction/rest 1',
            token: 'token/rest 1',
            actorId: 'user-rest',
            channelId: 'channel-rest',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-rest',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => {
          const calls: string[] = [];
          const fetchImpl = async (
            url: string | URL | Request,
          ): Promise<Response> => {
            calls.push(String(url));
            return new Response('not-json', { status: 202 });
          };
          return {
            calls,
            transport: new DiscordRestResponseTransport(
              '',
              'https://discord.test',
              fetchImpl,
            ),
          };
        },
        assert: async (context: {
          calls: string[];
          transport: DiscordRestResponseTransport;
        }) => {
          const receipt = await context.transport.postInteractionResponse(
            cases[0].inputs.interaction,
            createMessagePayload('Accepted.'),
          );
          const deferredReceipt =
            await context.transport.postInteractionDeferred(
              cases[0].inputs.interaction,
            );

          expect(receipt.statusCode).toBe(202);
          expect(deferredReceipt.statusCode).toBe(202);
          expect(receipt.responseBody).toBeNull();
          expect(receipt.endpoint).toBe(
            '/interactions/interaction%2Frest%201/token%2Frest%201/callback',
          );
          expect(context.calls).toEqual([
            'https://discord.test/interactions/interaction%2Frest%201/token%2Frest%201/callback',
            'https://discord.test/interactions/interaction%2Frest%201/token%2Frest%201/callback',
          ]);
          await expect(
            context.transport.postThreadMessage(
              'thread-rest',
              createMessagePayload('Accepted.'),
            ),
          ).rejects.toThrow('DISCORD_BOT_TOKEN');
        },
      },
      {
        inputs: {
          threadId: 'thread/rest 2',
        },
        mock: () => {
          const calls: string[] = [];
          const fetchImpl = async (
            url: string | URL | Request,
          ): Promise<Response> => {
            calls.push(String(url));
            return new Response('not-json', { status: 200 });
          };
          return {
            calls,
            transport: new DiscordRestResponseTransport(
              'bot-token',
              'https://discord.test',
              fetchImpl,
            ),
          };
        },
        assert: async (context: {
          calls: string[];
          transport: DiscordRestResponseTransport;
        }) => {
          const receipt = await context.transport.postThreadMessage(
            cases[1].inputs.threadId,
            createMessagePayload('Accepted.'),
          );

          expect(receipt.statusCode).toBe(200);
          expect(receipt.responseBody).toBeNull();
          expect(receipt.endpoint).toBe('/channels/thread%2Frest%202/messages');
          expect(context.calls).toEqual([
            'https://discord.test/channels/thread%2Frest%202/messages',
          ]);
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context);
    }
  });
});
