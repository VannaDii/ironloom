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

/**
 * Creates a transport that acknowledges callbacks but fails the thread copy.
 */
function createThreadFailingResponseTransport(
  error: unknown,
): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionDeferred(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postThreadMessage() {
      throw error;
    },
  };
}

/**
 * Creates a transport that returns a rejected thread-message receipt.
 */
function createThreadRejectingResponseTransport(): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionDeferred(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postThreadMessage(threadId) {
      return {
        endpoint: `/channels/${threadId}/messages`,
        statusCode: 403,
        responseBody: { message: 'Missing permissions' },
      };
    },
  };
}

/**
 * Creates a transport that returns a rejected interaction acknowledgement.
 */
function createAcknowledgementRejectingResponseTransport(): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      return {
        endpoint: `/interactions/${input.id}/${input.token}/callback`,
        statusCode: 404,
        responseBody: { message: 'Unknown interaction' },
      };
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
 * Creates a transport that throws before Discord acknowledgement is recorded.
 */
function createAcknowledgementThrowingResponseTransport(
  error: unknown,
): DiscordControlResponseTransport {
  return {
    async postInteractionResponse() {
      throw error;
    },
    async postInteractionDeferred(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postThreadMessage(threadId) {
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

  describe('Discord interaction responses and thread updates', () => {
    const cases = [
      {
        name: 'persists accepted thread interactions',
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
        assert: async (
          context: {
            store: FileStoreService;
            service: DiscordControlPlaneService;
          },
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          const result = await context.service.handleInteraction(
            inputs.interaction,
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
          const stored = await context.store.read('state', 'interaction-001');
          expect(stored.ok).toBe(true);
          if (stored.ok) {
            expect(
              stored.value.trace.filter(
                (entry) => entry === 'discord:thread-5:show-status',
              ),
            ).toHaveLength(1);
          }
        },
      },
      {
        name: 'projects pull request thread sessions into responses',
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
        assert: async (
          context: {
            messages: string[];
            store: FileStoreService;
            service: DiscordControlPlaneService;
          },
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          const result = await context.service.handleInteraction(
            inputs.interaction,
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

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      const context = await testCase.mock();
      await testCase.assert(context, testCase.inputs);
    });
  });

  const acknowledgementOrderCases = [
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
    {
      name: 'fails closed when the acknowledgement transport throws',
      inputs: {
        interaction: {
          id: 'interaction-ack-failure-003',
          token: 'token-ack-failure-3',
          actorId: 'user-ack-failure-3',
          channelId: 'channel-ack-failure-3',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          threadId: 'thread-ack-failure-3',
        } satisfies DiscordOperatorInteraction,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createAcknowledgementThrowingResponseTransport(
              new Error('Discord callback network failure'),
            ),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(false);
        expect(result.failedClosed).toBe(true);
        expect(result.responseReceipt).toBeUndefined();
        expect(result.responsePostError).toBe(
          'Discord callback network failure',
        );
        expect(await context.store.list('state')).not.toContain(
          'interaction-ack-failure-003',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-ack-failure-003:audit',
        );
      },
    },
  ];

  it.each(acknowledgementOrderCases)(
    '$name',
    async ({ inputs, mock, assert }) => {
      const context = await mock();
      await assert(context, inputs);
    },
  );

  const threadFailureCases = [
    {
      name: 'returns the acknowledgement and durable result when thread posting returns a rejected receipt',
      inputs: {
        interaction: {
          id: 'interaction-thread-failure-003',
          token: 'token-thread-failure-3',
          actorId: 'user-thread-failure-3',
          channelId: 'channel-thread-failure-3',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          threadId: 'thread-failure-3',
        } satisfies DiscordOperatorInteraction,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createThreadRejectingResponseTransport(),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(true);
        expect(result.responseReceipt?.endpoint).toBe(
          '/interactions/interaction-thread-failure-003/token-thread-failure-3/callback',
        );
        expect(result.threadReceipt?.statusCode).toBe(403);
        expect(result.threadPostError).toBe(
          'Discord thread status message returned HTTP 403.',
        );
        expect(await context.store.list('state')).toContain(
          'interaction-thread-failure-003',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-thread-failure-003:audit',
        );
      },
    },
    {
      name: 'returns the acknowledgement and durable result when thread posting throws an error',
      inputs: {
        interaction: {
          id: 'interaction-thread-failure-001',
          token: 'token-thread-failure-1',
          actorId: 'user-thread-failure-1',
          channelId: 'channel-thread-failure-1',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          threadId: 'thread-failure-1',
        } satisfies DiscordOperatorInteraction,
        error: new Error('thread message rejected'),
        expectedError: 'thread message rejected',
      },
      mock: async (inputs: { error: unknown }) => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createThreadFailingResponseTransport(inputs.error),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
          expectedError: string;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(true);
        expect(result.responseReceipt?.endpoint).toBe(
          '/interactions/interaction-thread-failure-001/token-thread-failure-1/callback',
        );
        expect(result.threadReceipt).toBeUndefined();
        expect(result.threadPostError).toBe(inputs.expectedError);
        expect(await context.store.list('state')).toContain(
          'interaction-thread-failure-001',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-thread-failure-001:audit',
        );
      },
    },
    {
      name: 'returns the acknowledgement and durable result when thread posting throws a non-error',
      inputs: {
        interaction: {
          id: 'interaction-thread-failure-002',
          token: 'token-thread-failure-2',
          actorId: 'user-thread-failure-2',
          channelId: 'channel-thread-failure-2',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          threadId: 'thread-failure-2',
        } satisfies DiscordOperatorInteraction,
        error: 'thread message rejected as text',
        expectedError: 'thread message rejected as text',
      },
      mock: async (inputs: { error: unknown }) => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createThreadFailingResponseTransport(inputs.error),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
          expectedError: string;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(true);
        expect(result.responseReceipt?.endpoint).toBe(
          '/interactions/interaction-thread-failure-002/token-thread-failure-2/callback',
        );
        expect(result.threadReceipt).toBeUndefined();
        expect(result.threadPostError).toBe(inputs.expectedError);
        expect(await context.store.list('state')).toContain(
          'interaction-thread-failure-002',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-thread-failure-002:audit',
        );
      },
    },
  ];

  it.each(threadFailureCases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock(inputs);
    await assert(context, inputs);
  });

  const acknowledgementFailureCases = [
    {
      name: 'fails closed when Discord rejects the interaction acknowledgement',
      inputs: {
        interaction: {
          id: 'interaction-ack-failure-001',
          token: 'token-ack-failure-1',
          actorId: 'user-ack-failure-1',
          channelId: 'channel-ack-failure-1',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          threadId: 'thread-ack-failure-1',
        } satisfies DiscordOperatorInteraction,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createAcknowledgementRejectingResponseTransport(),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(false);
        expect(result.failedClosed).toBe(true);
        expect(result.responseReceipt?.statusCode).toBe(404);
        expect(result.responsePostError).toBe(
          'Discord interaction acknowledgement returned HTTP 404.',
        );
        expect(result.threadReceipt).toBeUndefined();
        expect(await context.store.list('state')).not.toContain(
          'interaction-ack-failure-001',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-ack-failure-001:audit',
        );
      },
    },
    {
      name: 'fails closed with work-item context when Discord rejects the interaction acknowledgement',
      inputs: {
        interaction: {
          id: 'interaction-ack-failure-002',
          token: 'token-ack-failure-2',
          actorId: 'user-ack-failure-2',
          channelId: 'channel-ack-failure-2',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          boundSession: {
            id: 'thread-session-ack-failure-2',
            summary: 'Implementation session',
            status: 'running',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-ack-failure-2',
            channelId: 'thread-ack-failure-2',
            parentChannelId: 'implementation-channel',
            threadId: 'thread-ack-failure-2',
            kind: 'implementation',
            specId: 'spec-ack-failure-2',
            sliceId: 'slice-ack-failure-2',
            artifactId: 'artifact-ack-failure-2',
          },
        } satisfies DiscordOperatorInteraction,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createAcknowledgementRejectingResponseTransport(),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(false);
        expect(result.failedClosed).toBe(true);
        expect(result.workItem).toMatchObject({
          artifactId: 'artifact-ack-failure-2',
          threadKind: 'implementation',
        });
        expect(result.responseReceipt?.statusCode).toBe(404);
        expect(result.responsePostError).toBe(
          'Discord interaction acknowledgement returned HTTP 404.',
        );
        expect(await context.store.list('state')).not.toContain(
          'interaction-ack-failure-002',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-ack-failure-002:audit',
        );
      },
    },
    {
      name: 'fails closed with work-item context when acknowledgement transport throws',
      inputs: {
        interaction: {
          id: 'interaction-ack-failure-004',
          token: 'token-ack-failure-4',
          actorId: 'user-ack-failure-4',
          channelId: 'channel-ack-failure-4',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'show status',
          boundSession: {
            id: 'thread-session-ack-failure-4',
            summary: 'Spec session',
            status: 'running',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-ack-failure-4',
            channelId: 'thread-ack-failure-4',
            parentChannelId: 'spec-channel',
            threadId: 'thread-ack-failure-4',
            kind: 'spec',
            specId: 'spec-ack-failure-4',
            artifactId: 'artifact-ack-failure-4',
          },
        } satisfies DiscordOperatorInteraction,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createAcknowledgementThrowingResponseTransport(
              'Discord work-item acknowledgement network failure',
            ),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(false);
        expect(result.failedClosed).toBe(true);
        expect(result.workItem).toMatchObject({
          artifactId: 'artifact-ack-failure-4',
          threadKind: 'spec',
        });
        expect(result.responseReceipt).toBeUndefined();
        expect(result.responsePostError).toBe(
          'Discord work-item acknowledgement network failure',
        );
        expect(await context.store.list('state')).not.toContain(
          'interaction-ack-failure-004',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-ack-failure-004:audit',
        );
      },
    },
  ];

  it.each(acknowledgementFailureCases)(
    '$name',
    async ({ inputs, mock, assert }) => {
      const context = await mock();
      await assert(context, inputs);
    },
  );

  const routeFailureCases = [
    {
      name: 'fails closed and responds when Discord thread binding is ambiguous',
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
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
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
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
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
    {
      name: 'reports route refusal acknowledgement rejection',
      inputs: {
        interaction: {
          id: 'interaction-route-ack-failure-001',
          token: 'token-route-ack-failure-1',
          actorId: 'user-route-ack-failure-1',
          channelId: 'channel-route-ack-failure-1',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'merge now',
          threadId: 'thread-route-ack-failure-1',
          boundThreadId: 'thread-route-ack-failure-2',
          privileged: true,
        } satisfies DiscordOperatorInteraction,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createAcknowledgementRejectingResponseTransport(),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(false);
        expect(result.failedClosed).toBe(true);
        expect(result.responseReceipt?.statusCode).toBe(404);
        expect(result.responsePostError).toBe(
          'Discord interaction acknowledgement returned HTTP 404.',
        );
        expect(await context.store.list('state')).not.toContain(
          'interaction-route-ack-failure-001',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-route-ack-failure-001:audit',
        );
        const auditRecord = await context.store.read(
          'audit',
          'interaction-route-ack-failure-001:audit',
        );
        expect(auditRecord.ok).toBe(true);
        if (auditRecord.ok) {
          expect(auditRecord.value).toMatchObject({
            payload: {
              reason: 'Discord interaction acknowledgement returned HTTP 404.',
            },
          });
        }
      },
    },
    {
      name: 'reports route refusal acknowledgement transport failures',
      inputs: {
        interaction: {
          id: 'interaction-route-ack-failure-002',
          token: 'token-route-ack-failure-2',
          actorId: 'user-route-ack-failure-2',
          channelId: 'channel-route-ack-failure-2',
          updatedAt: '2026-04-04T00:00:00.000Z',
          commandName: 'merge now',
          threadId: 'thread-route-ack-failure-2',
          boundThreadId: 'thread-route-ack-failure-3',
          privileged: true,
        } satisfies DiscordOperatorInteraction,
      },
      mock: async () => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
        const store = new FileStoreService(rootDirectory);
        return {
          store,
          service: new DiscordControlPlaneService(
            new DecisionPolicyService(),
            new TelemetryEventService(store),
            store,
            createAcknowledgementThrowingResponseTransport(
              'Discord route refusal network failure',
            ),
          ),
        };
      },
      assert: async (
        context: {
          store: FileStoreService;
          service: DiscordControlPlaneService;
        },
        inputs: {
          interaction: DiscordOperatorInteraction;
        },
      ) => {
        const result = await context.service.handleInteraction(
          inputs.interaction,
        );

        expect(result.allowed).toBe(false);
        expect(result.failedClosed).toBe(true);
        expect(result.responseReceipt).toBeUndefined();
        expect(result.responsePostError).toBe(
          'Discord route refusal network failure',
        );
        expect(await context.store.list('state')).not.toContain(
          'interaction-route-ack-failure-002',
        );
        expect(await context.store.list('audit')).toContain(
          'interaction-route-ack-failure-002:audit',
        );
        const auditRecord = await context.store.read(
          'audit',
          'interaction-route-ack-failure-002:audit',
        );
        expect(auditRecord.ok).toBe(true);
        if (auditRecord.ok) {
          expect(auditRecord.value).toMatchObject({
            payload: {
              reason: 'Discord route refusal network failure',
            },
          });
        }
      },
    },
  ];

  it.each(routeFailureCases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock();
    await assert(context, inputs);
  });

  describe('Discord REST interaction and thread responses', () => {
    const cases = [
      {
        name: 'posts structured interaction and thread payloads',
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
        assert: async (
          context: {
            bodies: string[];
            calls: string[];
            transport: DiscordRestResponseTransport;
          },
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          const interactionReceipt =
            await context.transport.postInteractionResponse(
              inputs.interaction,
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

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      const context = testCase.mock();
      await testCase.assert(context, testCase.inputs);
    });
  });

  describe('Discord REST empty response bodies', () => {
    const cases = [
      {
        name: 'normalizes empty interaction response bodies to null',
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
        assert: async (
          transport: DiscordRestResponseTransport,
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          const receipt = await transport.postInteractionResponse(
            inputs.interaction,
            createMessagePayload('accepted'),
          );

          expect(receipt.statusCode).toBe(200);
          expect(receipt.responseBody).toBeNull();
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      await testCase.assert(testCase.mock(), testCase.inputs);
    });
  });

  describe('loopback receipts for hermetic interaction probes', () => {
    const cases = [
      {
        name: 'returns loopback interaction, thread, and deferred receipts',
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

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      await testCase.assert(testCase.mock(), testCase.inputs);
    });
  });

  describe('blocked action thread responses', () => {
    const cases = [
      {
        name: 'posts blocked worktree release responses to the bound thread',
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
        assert: async (
          context: { service: DiscordControlPlaneService },
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          const result = await context.service.handleInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(false);
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-9/messages',
          );
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      await testCase.assert(await testCase.mock(), testCase.inputs);
    });
  });

  describe('Discord bot token requirements', () => {
    const cases = [
      {
        name: 'requires a bot token before posting thread messages',
        inputs: {
          threadId: 'thread-8',
        },
        mock: () =>
          new DiscordRestResponseTransport('', 'https://discord.test/api/v10'),
        assert: async (
          transport: DiscordRestResponseTransport,
          inputs: { threadId: string },
        ) => {
          await expect(
            transport.postThreadMessage(
              inputs.threadId,
              createMessagePayload('blocked'),
            ),
          ).rejects.toThrow('DISCORD_BOT_TOKEN');
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      await testCase.assert(testCase.mock(), testCase.inputs);
    });
  });

  describe('Discord REST response edge cases', () => {
    const cases = [
      {
        name: 'posts interaction responses and rejects thread messages without bot tokens',
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
        assert: async (
          context: {
            calls: string[];
            transport: DiscordRestResponseTransport;
          },
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          const receipt = await context.transport.postInteractionResponse(
            inputs.interaction,
            createMessagePayload('Accepted.'),
          );
          const deferredReceipt =
            await context.transport.postInteractionDeferred(inputs.interaction);

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
        name: 'posts encoded thread messages with bot tokens',
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
        assert: async (
          context: {
            calls: string[];
            transport: DiscordRestResponseTransport;
          },
          inputs: { threadId: string },
        ) => {
          const receipt = await context.transport.postThreadMessage(
            inputs.threadId,
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

    it.each(cases)('$name', async (testCase) => {
      expect.hasAssertions();
      const context = testCase.mock();
      await testCase.assert(context, testCase.inputs);
    });
  });
});
