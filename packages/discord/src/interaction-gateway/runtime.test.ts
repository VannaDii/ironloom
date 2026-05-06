import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileStoreService } from '@vannadii/devplat-storage';

import { DiscordInteractionGatewayClientService } from './client.js';
import type {
  DiscordGatewayConnection,
  DiscordGatewayHeartbeatScheduler,
} from './client.js';
import {
  createStorageBackedDiscordGatewayBindingResolver,
  startDiscordInteractionGatewayRuntimeFromEnvironment,
} from './runtime.js';
import type { DiscordInteractionCallback } from '../discord-control-plane/codec.js';

class FakeDiscordGatewayConnection implements DiscordGatewayConnection {
  public readonly sentMessages: string[] = [];
  private messageListener: ((message: string) => void) | undefined = undefined;

  public send(message: string): void {
    this.sentMessages.push(message);
  }

  public close(): void {}

  public onMessage(listener: (message: string) => void): void {
    this.messageListener = listener;
  }

  public onClose(): void {}

  public emitMessage(message: string): void {
    this.messageListener?.(message);
  }
}

class NoopDiscordGatewayHeartbeatScheduler implements DiscordGatewayHeartbeatScheduler {
  public schedule(): () => void {
    return () => undefined;
  }
}

function createCallback(threadId: string): DiscordInteractionCallback {
  return {
    id: 'interaction-1',
    token: 'token-1',
    channel_id: threadId,
    data: {
      custom_id: `devplat:v1:show-status:${threadId}`,
    },
    user: {
      id: 'operator-1',
    },
  };
}

/**
 * Creates a button callback whose channel is the parent channel while the
 * component id carries the bound thread id.
 */
function createParentChannelButtonCallback(input: {
  parentChannelId: string;
  threadId: string;
}): DiscordInteractionCallback {
  return {
    id: 'interaction-parent-channel',
    token: 'token-parent-channel',
    channel_id: input.parentChannelId,
    data: {
      custom_id: `devplat:v1:show-status:${input.threadId}`,
    },
    user: {
      id: 'operator-1',
    },
  };
}

describe('Discord interaction Gateway runtime', () => {
  const cases = [
    {
      name: 'resolves exactly one stored thread session for Gateway callbacks',
      inputs: {
        threadId: 'thread-1',
      },
      mock: async (inputs: { threadId: string }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-runtime-'),
        );
        const store = new FileStoreService(rootDirectory);
        await store.store({
          id: 'session-1',
          key: 'session-1',
          scope: 'state',
          summary: 'Implementation thread',
          status: 'approved',
          trace: [],
          updatedAt: '2026-05-01T00:00:00.000Z',
          payload: {
            id: 'session-1',
            summary: 'Implementation thread',
            status: 'approved',
            trace: [],
            updatedAt: '2026-05-01T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: inputs.threadId,
            parentChannelId: 'implementation-channel',
            threadId: inputs.threadId,
            artifactId: 'artifact-1',
            kind: 'implementation',
            specId: 'spec-1',
            sliceId: 'slice-1',
            pullRequestNumber: null,
          },
        });

        const resolver =
          createStorageBackedDiscordGatewayBindingResolver(store);
        return resolver(createCallback(inputs.threadId));
      },
      assert: async (
        result: Awaited<
          ReturnType<
            ReturnType<typeof createStorageBackedDiscordGatewayBindingResolver>
          >
        >,
      ) => {
        expect(result).toMatchObject({
          boundThreadId: 'thread-1',
          boundSession: {
            kind: 'implementation',
            sliceId: 'slice-1',
          },
        });
      },
    },
    {
      name: 'resolves stored thread sessions from parent-channel button callbacks',
      inputs: {
        parentChannelId: 'implementation-channel',
        threadId: 'thread-from-component',
      },
      mock: async (inputs: { parentChannelId: string; threadId: string }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-runtime-'),
        );
        const store = new FileStoreService(rootDirectory);
        await store.store({
          id: 'session-parent-channel',
          key: 'session-parent-channel',
          scope: 'state',
          summary: 'Implementation thread',
          status: 'approved',
          trace: [],
          updatedAt: '2026-05-01T00:00:00.000Z',
          payload: {
            id: 'session-parent-channel',
            summary: 'Implementation thread',
            status: 'approved',
            trace: [],
            updatedAt: '2026-05-01T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: inputs.threadId,
            parentChannelId: inputs.parentChannelId,
            threadId: inputs.threadId,
            artifactId: 'artifact-parent-channel',
            kind: 'implementation',
            specId: 'spec-1',
            sliceId: 'slice-parent-channel',
            pullRequestNumber: null,
          },
        });

        const resolver =
          createStorageBackedDiscordGatewayBindingResolver(store);
        return resolver(createParentChannelButtonCallback(inputs));
      },
      assert: async (
        result: Awaited<
          ReturnType<
            ReturnType<typeof createStorageBackedDiscordGatewayBindingResolver>
          >
        >,
      ) => {
        expect(result).toMatchObject({
          threadId: 'thread-from-component',
          boundThreadId: 'thread-from-component',
          boundSession: {
            kind: 'implementation',
            sliceId: 'slice-parent-channel',
          },
        });
      },
    },
    {
      name: 'rejects component-thread callbacks from unrelated channels',
      inputs: {
        parentChannelId: 'implementation-channel',
        threadId: 'thread-from-component',
      },
      mock: async (inputs: { parentChannelId: string; threadId: string }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-runtime-'),
        );
        const store = new FileStoreService(rootDirectory);
        await store.store({
          id: 'session-unrelated-channel',
          key: 'session-unrelated-channel',
          scope: 'state',
          summary: 'Implementation thread',
          status: 'approved',
          trace: [],
          updatedAt: '2026-05-01T00:00:00.000Z',
          payload: {
            id: 'session-unrelated-channel',
            summary: 'Implementation thread',
            status: 'approved',
            trace: [],
            updatedAt: '2026-05-01T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: inputs.threadId,
            parentChannelId: inputs.parentChannelId,
            threadId: inputs.threadId,
            artifactId: 'artifact-unrelated-channel',
            kind: 'implementation',
            specId: 'spec-1',
            sliceId: 'slice-unrelated-channel',
            pullRequestNumber: null,
          },
        });

        const resolver =
          createStorageBackedDiscordGatewayBindingResolver(store);
        return resolver(
          createParentChannelButtonCallback({
            parentChannelId: 'unrelated-channel',
            threadId: inputs.threadId,
          }),
        );
      },
      assert: async (
        result: Awaited<
          ReturnType<
            ReturnType<typeof createStorageBackedDiscordGatewayBindingResolver>
          >
        >,
      ) => {
        expect(result).toEqual({
          threadId: 'unrelated-channel',
          boundThreadId: 'unresolved',
          summary:
            'Discord Gateway interaction did not resolve a bound thread.',
        });
      },
    },
    {
      name: 'returns a fail-closed binding when multiple sessions match',
      inputs: {
        threadId: 'thread-duplicate',
      },
      mock: async (inputs: { threadId: string }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-runtime-'),
        );
        const store = new FileStoreService(rootDirectory);
        const payloads = ['session-a', 'session-b'].map((sessionId) => ({
          id: sessionId,
          key: sessionId,
          scope: 'state',
          summary: 'Duplicate thread',
          status: 'approved',
          trace: [],
          updatedAt: '2026-05-01T00:00:00.000Z',
          payload: {
            id: sessionId,
            summary: 'Duplicate thread',
            status: 'approved',
            trace: [],
            updatedAt: '2026-05-01T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: inputs.threadId,
            parentChannelId: 'implementation-channel',
            threadId: inputs.threadId,
            artifactId: `${sessionId}-artifact`,
            kind: 'implementation',
            specId: 'spec-1',
            sliceId: sessionId,
            pullRequestNumber: null,
          },
        }));
        await Promise.all(payloads.map((payload) => store.store(payload)));

        const resolver =
          createStorageBackedDiscordGatewayBindingResolver(store);
        return resolver(createCallback(inputs.threadId));
      },
      assert: async (
        result: Awaited<
          ReturnType<
            ReturnType<typeof createStorageBackedDiscordGatewayBindingResolver>
          >
        >,
      ) => {
        expect(result).toEqual({
          threadId: 'thread-duplicate',
          boundThreadId: 'ambiguous',
          summary:
            'Discord Gateway interaction resolved multiple bound threads.',
        });
      },
    },
    {
      name: 'skips unreadable stored records while resolving sessions',
      inputs: {
        threadId: 'thread-1',
      },
      mock: async (inputs: { threadId: string }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-runtime-'),
        );
        await mkdir(join(rootDirectory, 'state'), { recursive: true });
        await writeFile(
          join(rootDirectory, 'state', 'broken.json'),
          '{',
          'utf8',
        );
        const resolver = createStorageBackedDiscordGatewayBindingResolver(
          new FileStoreService(rootDirectory),
        );

        return resolver(createCallback(inputs.threadId));
      },
      assert: async (
        result: Awaited<
          ReturnType<
            ReturnType<typeof createStorageBackedDiscordGatewayBindingResolver>
          >
        >,
      ) => {
        expect(result.boundThreadId).toBe('unresolved');
      },
    },
    {
      name: 'skips readable non-session records while resolving sessions',
      inputs: {
        threadId: 'thread-1',
      },
      mock: async (inputs: { threadId: string }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-runtime-'),
        );
        const store = new FileStoreService(rootDirectory);
        await store.store({
          id: 'not-session',
          key: 'not-session',
          scope: 'state',
          summary: 'Not a Discord session',
          status: 'approved',
          trace: [],
          updatedAt: '2026-05-01T00:00:00.000Z',
          payload: {
            kind: 'not-discord-session',
          },
        });
        const resolver =
          createStorageBackedDiscordGatewayBindingResolver(store);

        return resolver(createCallback(inputs.threadId));
      },
      assert: async (
        result: Awaited<
          ReturnType<
            ReturnType<typeof createStorageBackedDiscordGatewayBindingResolver>
          >
        >,
      ) => {
        expect(result.boundThreadId).toBe('unresolved');
      },
    },
    {
      name: 'creates the default runtime client when only a connection factory is supplied',
      inputs: {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DEVPLAT_STORAGE_ROOT: 'devplat-state',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DISCORD_GATEWAY_URL: 'wss://gateway.discord.test/?v=10&encoding=json',
          DISCORD_GATEWAY_INTENTS: '0',
        },
      },
      mock: (inputs: { env: Record<string, string> }) => {
        const connection = new FakeDiscordGatewayConnection();
        const session = startDiscordInteractionGatewayRuntimeFromEnvironment(
          inputs.env,
          {
            connectionFactory: {
              connect: () => connection,
            },
            heartbeatScheduler: new NoopDiscordGatewayHeartbeatScheduler(),
          },
        );

        return { session };
      },
      assert: async (context: {
        session: ReturnType<DiscordInteractionGatewayClientService['start']>;
      }) => {
        expect(context.session.gatewayUrl).toBe(
          'wss://gateway.discord.test/?v=10&encoding=json',
        );
      },
    },
    {
      name: 'returns a fail-closed binding when no stored session matches',
      inputs: {
        threadId: 'thread-missing',
      },
      mock: async (inputs: { threadId: string }) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-discord-gateway-runtime-'),
        );
        const resolver = createStorageBackedDiscordGatewayBindingResolver(
          new FileStoreService(rootDirectory),
        );

        return resolver(createCallback(inputs.threadId));
      },
      assert: async (
        result: Awaited<
          ReturnType<
            ReturnType<typeof createStorageBackedDiscordGatewayBindingResolver>
          >
        >,
      ) => {
        expect(result).toEqual({
          threadId: 'thread-missing',
          boundThreadId: 'unresolved',
          summary:
            'Discord Gateway interaction did not resolve a bound thread.',
        });
      },
    },
    {
      name: 'starts the runtime from normalized environment configuration',
      inputs: {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DEVPLAT_STORAGE_ROOT: 'devplat-state',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DISCORD_GATEWAY_URL: 'wss://gateway.discord.test/?v=10&encoding=json',
          DISCORD_GATEWAY_INTENTS: '0',
        },
      },
      mock: async (inputs: { env: Record<string, string> }) => {
        const connection = new FakeDiscordGatewayConnection();
        const client = new DiscordInteractionGatewayClientService({
          connect: () => connection,
        });
        const session =
          await startDiscordInteractionGatewayRuntimeFromEnvironment(
            inputs.env,
            {
              client,
              heartbeatScheduler: new NoopDiscordGatewayHeartbeatScheduler(),
            },
          );

        return { session };
      },
      assert: async (context: {
        session: ReturnType<DiscordInteractionGatewayClientService['start']>;
      }) => {
        expect(context.session.gatewayUrl).toBe(
          'wss://gateway.discord.test/?v=10&encoding=json',
        );
      },
    },
    {
      name: 'starts without a heartbeat scheduler override',
      inputs: {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DEVPLAT_STORAGE_ROOT: 'devplat-state',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DISCORD_GATEWAY_URL: 'wss://gateway.discord.test/?v=10&encoding=json',
          DISCORD_GATEWAY_INTENTS: '0',
        },
      },
      mock: (inputs: { env: Record<string, string> }) => {
        const connection = new FakeDiscordGatewayConnection();
        const client = new DiscordInteractionGatewayClientService({
          connect: () => connection,
        });
        const session = startDiscordInteractionGatewayRuntimeFromEnvironment(
          inputs.env,
          {
            client,
          },
        );

        return { session };
      },
      assert: async (context: {
        session: ReturnType<DiscordInteractionGatewayClientService['start']>;
      }) => {
        expect(context.session.gatewayUrl).toBe(
          'wss://gateway.discord.test/?v=10&encoding=json',
        );
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    await testCase.assert(result);
  });
});
