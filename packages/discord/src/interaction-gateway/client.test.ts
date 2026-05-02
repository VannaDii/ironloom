import { describe, expect, it, vi } from 'vitest';

import {
  DISCORD_GATEWAY_DEFAULT_URL,
  DISCORD_GATEWAY_DISPATCH_OPCODE,
  DISCORD_GATEWAY_HEARTBEAT_OPCODE,
  DISCORD_GATEWAY_HELLO_OPCODE,
  DISCORD_GATEWAY_IDENTIFY_OPCODE,
  DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
} from './constants.js';
import {
  DiscordInteractionGatewayClientService,
  IntervalDiscordGatewayHeartbeatScheduler,
  WebSocketDiscordGatewayConnectionFactory,
  type DiscordGatewayConnection,
  type DiscordGatewayHeartbeatScheduler,
} from './client.js';
import type { DiscordInteractionGatewayResult } from './codec.js';

class FakeDiscordGatewayConnection implements DiscordGatewayConnection {
  public readonly sentMessages: string[] = [];
  public closed = false;
  private messageListener: ((message: string) => void) | undefined = undefined;
  private closeListener: (() => void) | undefined = undefined;

  public send(message: string): void {
    this.sentMessages.push(message);
  }

  public close(): void {
    this.closed = true;
    this.closeListener?.();
  }

  public onMessage(listener: (message: string) => void): void {
    this.messageListener = listener;
  }

  public onClose(listener: () => void): void {
    this.closeListener = listener;
  }

  public emitMessage(message: string): void {
    this.messageListener?.(message);
  }
}

class FakeDiscordGatewayHeartbeatScheduler implements DiscordGatewayHeartbeatScheduler {
  public intervalMs = 0;
  private heartbeat: (() => void) | undefined = undefined;

  public schedule(heartbeat: () => void, intervalMs: number): () => void {
    this.heartbeat = heartbeat;
    this.intervalMs = intervalMs;
    return () => {
      this.heartbeat = undefined;
    };
  }

  public tick(): void {
    this.heartbeat?.();
  }
}

class FakeGlobalWebSocket {
  private static current: FakeGlobalWebSocket | undefined = undefined;
  public readonly sentMessages: string[] = [];
  private messageListener:
    | ((event: { readonly data: unknown }) => void)
    | undefined = undefined;
  private closeListener: (() => void) | undefined = undefined;

  public constructor(public readonly url: string) {
    FakeGlobalWebSocket.current = this;
  }

  public static latest(): FakeGlobalWebSocket | undefined {
    return FakeGlobalWebSocket.current;
  }

  public send(message: string): void {
    this.sentMessages.push(message);
  }

  public close(): void {
    this.closeListener?.();
  }

  public addEventListener(
    type: string,
    listener: ((event: { readonly data: unknown }) => void) | (() => void),
  ): void {
    switch (type) {
      case 'message':
        this.messageListener = (event) => {
          listener(event);
        };
        break;
      case 'close':
        this.closeListener = () => {
          listener();
        };
        break;
      default:
        break;
    }
  }

  public emitMessage(data: unknown): void {
    this.messageListener?.({ data });
  }
}

function decodeSentMessage(message: string): unknown {
  return JSON.parse(message);
}

describe('DiscordInteractionGatewayClientService', () => {
  const cases = [
    {
      name: 'identifies and heartbeats after Discord Gateway hello',
      inputs: {
        hello: JSON.stringify({
          op: DISCORD_GATEWAY_HELLO_OPCODE,
          d: {
            heartbeat_interval: 45_000,
          },
        }),
      },
      mock: (inputs: { hello: string }) => {
        const connection = new FakeDiscordGatewayConnection();
        const scheduler = new FakeDiscordGatewayHeartbeatScheduler();
        const service = new DiscordInteractionGatewayClientService({
          connect: () => connection,
        });
        const session = service.start({
          botToken: 'bot-token-1',
          heartbeatScheduler: scheduler,
        });

        connection.emitMessage(inputs.hello);
        scheduler.tick();

        return { connection, scheduler, session };
      },
      assert: (context: {
        connection: FakeDiscordGatewayConnection;
        scheduler: FakeDiscordGatewayHeartbeatScheduler;
        session: ReturnType<DiscordInteractionGatewayClientService['start']>;
      }) => {
        expect(context.session.gatewayUrl).toBe(DISCORD_GATEWAY_DEFAULT_URL);
        expect(context.scheduler.intervalMs).toBe(45_000);
        expect(context.connection.sentMessages.map(decodeSentMessage)).toEqual([
          {
            op: DISCORD_GATEWAY_IDENTIFY_OPCODE,
            d: {
              token: 'bot-token-1',
              intents: 0,
              properties: {
                $os: 'linux',
                $browser: 'devplat',
                $device: 'devplat',
              },
            },
          },
          {
            op: DISCORD_GATEWAY_HEARTBEAT_OPCODE,
            d: null,
          },
        ]);
      },
    },
    {
      name: 'routes interaction dispatches and preserves the latest sequence heartbeat',
      inputs: {
        hello: JSON.stringify({
          op: DISCORD_GATEWAY_HELLO_OPCODE,
          d: {
            heartbeat_interval: 30_000,
          },
        }),
        dispatch: JSON.stringify({
          op: DISCORD_GATEWAY_DISPATCH_OPCODE,
          t: DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
          s: 12,
          d: {
            id: 'interaction-1',
            token: 'token-1',
            channel_id: 'thread-1',
            data: {
              custom_id: 'devplat:v1:show-status:thread-1',
            },
            user: {
              id: 'operator-1',
            },
          },
        }),
        dispatchWithoutSequence: JSON.stringify({
          op: DISCORD_GATEWAY_DISPATCH_OPCODE,
          t: DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
          d: {
            id: 'interaction-2',
            token: 'token-2',
            channel_id: 'thread-1',
            data: {
              custom_id: 'devplat:v1:show-status:thread-1',
            },
            user: {
              id: 'operator-1',
            },
          },
        }),
      },
      mock: async (inputs: {
        hello: string;
        dispatch: string;
        dispatchWithoutSequence: string;
      }) => {
        const connection = new FakeDiscordGatewayConnection();
        const scheduler = new FakeDiscordGatewayHeartbeatScheduler();
        const results: DiscordInteractionGatewayResult[] = [];
        const service = new DiscordInteractionGatewayClientService(
          {
            connect: () => connection,
          },
          {
            handleDispatch: (event) =>
              Promise.resolve({
                status: 'handled',
                interactionId: String(event.s),
                threadId: 'thread-1',
                controlResult: {
                  request: {
                    id: 'interaction-1',
                    summary: 'show-status',
                    status: 'running',
                    trace: [],
                    updatedAt: '2026-05-01T00:00:00.000Z',
                    actorId: 'operator-1',
                    threadId: 'thread-1',
                    channelId: 'thread-1',
                    action: 'show-status',
                    privileged: false,
                  },
                  policyDecisionId: 'policy-1',
                  allowed: true,
                  persistedKey: 'interaction-1',
                  failedClosed: false,
                },
              }),
          },
        );
        service.start({
          botToken: 'bot-token-1',
          heartbeatScheduler: scheduler,
          onResult: (result) => {
            results.push(result);
          },
        });

        connection.emitMessage(inputs.hello);
        connection.emitMessage(inputs.dispatch);
        connection.emitMessage(inputs.dispatchWithoutSequence);
        await Promise.resolve();
        await Promise.resolve();
        scheduler.tick();

        return { connection, results };
      },
      assert: (context: {
        connection: FakeDiscordGatewayConnection;
        results: DiscordInteractionGatewayResult[];
      }) => {
        expect(context.results).toEqual([
          expect.objectContaining({
            status: 'handled',
            threadId: 'thread-1',
          }),
          expect.objectContaining({
            status: 'handled',
            threadId: 'thread-1',
          }),
        ]);
        expect(
          context.connection.sentMessages.map(decodeSentMessage).at(-1),
        ).toEqual({
          op: DISCORD_GATEWAY_HEARTBEAT_OPCODE,
          d: 12,
        });
      },
    },
    {
      name: 'ignores invalid JSON heartbeat acknowledgements and unknown payloads',
      inputs: {
        invalidJson: '{',
        heartbeatAck: JSON.stringify({
          op: 11,
        }),
        unknown: JSON.stringify({
          op: 99,
        }),
      },
      mock: (inputs: {
        invalidJson: string;
        heartbeatAck: string;
        unknown: string;
      }) => {
        const connection = new FakeDiscordGatewayConnection();
        const service = new DiscordInteractionGatewayClientService({
          connect: () => connection,
        });
        service.start({
          botToken: 'bot-token-1',
        });

        connection.emitMessage(inputs.invalidJson);
        connection.emitMessage(inputs.heartbeatAck);
        connection.emitMessage(inputs.unknown);

        return { connection };
      },
      assert: (context: { connection: FakeDiscordGatewayConnection }) => {
        expect(context.connection.sentMessages).toEqual([]);
      },
    },
    {
      name: 'reports asynchronous dispatch handler failures',
      inputs: {
        dispatch: JSON.stringify({
          op: DISCORD_GATEWAY_DISPATCH_OPCODE,
          t: DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
          s: 5,
          d: {
            id: 'interaction-error',
            token: 'token-error',
            channel_id: 'thread-error',
            user: {
              id: 'operator-error',
            },
          },
        }),
      },
      mock: async (inputs: { dispatch: string }) => {
        const connection = new FakeDiscordGatewayConnection();
        const errors: Error[] = [];
        const service = new DiscordInteractionGatewayClientService(
          {
            connect: () => connection,
          },
          {
            handleDispatch: () => Promise.reject(new Error('dispatch failed')),
          },
        );
        service.start({
          botToken: 'bot-token-1',
          onError: (error) => {
            errors.push(error);
          },
        });

        connection.emitMessage(inputs.dispatch);
        await Promise.resolve();

        return { errors };
      },
      assert: (context: { errors: Error[] }) => {
        expect(context.errors.map((error) => error.message)).toEqual([
          'dispatch failed',
        ]);
      },
    },
    {
      name: 'wraps non-error asynchronous dispatch handler failures',
      inputs: {
        dispatch: JSON.stringify({
          op: DISCORD_GATEWAY_DISPATCH_OPCODE,
          t: DISCORD_GATEWAY_INTERACTION_CREATE_EVENT,
          s: 5,
          d: {
            id: 'interaction-error',
            token: 'token-error',
            channel_id: 'thread-error',
            user: {
              id: 'operator-error',
            },
          },
        }),
      },
      mock: async (inputs: { dispatch: string }) => {
        const connection = new FakeDiscordGatewayConnection();
        const errors: Error[] = [];
        const service = new DiscordInteractionGatewayClientService(
          {
            connect: () => connection,
          },
          {
            handleDispatch: () => Promise.reject('dispatch failed'),
          },
        );
        service.start({
          botToken: 'bot-token-1',
          onError: (error) => {
            errors.push(error);
          },
        });

        connection.emitMessage(inputs.dispatch);
        await Promise.resolve();

        return { errors };
      },
      assert: (context: { errors: Error[] }) => {
        expect(context.errors.map((error) => error.message)).toEqual([
          'dispatch failed',
        ]);
      },
    },
    {
      name: 'wraps the default WebSocket connection factory',
      inputs: {
        gatewayUrl: 'wss://gateway.discord.test/?v=10&encoding=json',
      },
      mock: (inputs: { gatewayUrl: string }) => {
        const originalWebSocket = globalThis.WebSocket;
        Object.defineProperty(globalThis, 'WebSocket', {
          configurable: true,
          value: FakeGlobalWebSocket,
        });
        const connection =
          new WebSocketDiscordGatewayConnectionFactory().connect(
            inputs.gatewayUrl,
          );
        const messages: string[] = [];
        connection.onMessage((message) => {
          messages.push(message);
        });
        connection.onClose(() => {
          messages.push('closed');
        });
        connection.send('payload-1');
        FakeGlobalWebSocket.latest()?.emitMessage('payload-2');
        FakeGlobalWebSocket.latest()?.emitMessage({ nested: true });
        connection.close();

        return {
          latest: FakeGlobalWebSocket.latest(),
          messages,
          originalWebSocket,
        };
      },
      assert: (context: {
        latest: FakeGlobalWebSocket | undefined;
        messages: string[];
        originalWebSocket: typeof WebSocket;
      }) => {
        Object.defineProperty(globalThis, 'WebSocket', {
          configurable: true,
          value: context.originalWebSocket,
        });
        expect(context.latest?.url).toBe(
          'wss://gateway.discord.test/?v=10&encoding=json',
        );
        expect(context.latest?.sentMessages).toEqual(['payload-1']);
        expect(context.messages).toEqual([
          'payload-2',
          '[object Object]',
          'closed',
        ]);
      },
    },
    {
      name: 'closes the connection and cancels heartbeat scheduling',
      inputs: {},
      mock: () => {
        const connection = new FakeDiscordGatewayConnection();
        const scheduler = new FakeDiscordGatewayHeartbeatScheduler();
        const service = new DiscordInteractionGatewayClientService({
          connect: () => connection,
        });
        const session = service.start({
          botToken: 'bot-token-1',
          heartbeatScheduler: scheduler,
        });

        connection.emitMessage(
          JSON.stringify({
            op: DISCORD_GATEWAY_HELLO_OPCODE,
            d: {
              heartbeat_interval: 10,
            },
          }),
        );
        session.close();
        scheduler.tick();

        return { connection };
      },
      assert: (context: { connection: FakeDiscordGatewayConnection }) => {
        expect(context.connection.closed).toBe(true);
        expect(context.connection.sentMessages).toHaveLength(1);
      },
    },
    {
      name: 'schedules and cancels live interval heartbeats',
      inputs: {},
      mock: () => {
        vi.useFakeTimers();
        const heartbeats: string[] = [];
        const cancel = new IntervalDiscordGatewayHeartbeatScheduler().schedule(
          () => {
            heartbeats.push('tick');
          },
          1_000,
        );

        vi.advanceTimersByTime(1_000);
        cancel();
        vi.advanceTimersByTime(1_000);
        vi.useRealTimers();

        return { heartbeats };
      },
      assert: (context: { heartbeats: string[] }) => {
        expect(context.heartbeats).toEqual(['tick']);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    testCase.assert(result);
  });
});
