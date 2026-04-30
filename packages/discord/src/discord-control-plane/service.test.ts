import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  DiscordControlPlaneService,
  DiscordRestResponseTransport,
  type DiscordControlResponseTransport,
} from './service.js';
import type {
  DiscordOperatorInteraction,
  DiscordResponseReceipt,
} from './types.js';

function createReceipt(endpoint: string): DiscordResponseReceipt {
  return {
    endpoint,
    statusCode: 200,
    responseBody: { ok: true },
  };
}

function createResponseTransport(): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
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
    ];

    for (const testCase of cases) {
      const context = await testCase.mock();
      await testCase.assert(context);
    }
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
          const fetchImpl = async (url: string): Promise<Response> => {
            calls.push(url);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          };
          return {
            calls,
            transport: new DiscordRestResponseTransport(
              'bot-token',
              'https://discord.test/api/v10',
              fetchImpl,
            ),
          };
        },
        assert: async (context: {
          calls: string[];
          transport: DiscordRestResponseTransport;
        }) => {
          const interactionReceipt =
            await context.transport.postInteractionResponse(
              cases[0].inputs.interaction,
              'accepted',
            );
          const threadReceipt = await context.transport.postThreadMessage(
            'thread-7',
            'accepted',
          );

          expect(interactionReceipt.endpoint).toBe(
            '/interactions/interaction-003/token-3/callback',
          );
          expect(threadReceipt.endpoint).toBe('/channels/thread-7/messages');
          expect(context.calls).toEqual([
            'https://discord.test/api/v10/interactions/interaction-003/token-3/callback',
            'https://discord.test/api/v10/channels/thread-7/messages',
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
            'accepted',
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
            transport.postThreadMessage(cases[0].inputs.threadId, 'blocked'),
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
            'Accepted.',
          );

          expect(receipt.statusCode).toBe(202);
          expect(receipt.responseBody).toBeNull();
          expect(receipt.endpoint).toBe(
            '/interactions/interaction%2Frest%201/token%2Frest%201/callback',
          );
          expect(context.calls).toEqual([
            'https://discord.test/interactions/interaction%2Frest%201/token%2Frest%201/callback',
          ]);
          await expect(
            context.transport.postThreadMessage('thread-rest', 'Accepted.'),
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
            'Accepted.',
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
