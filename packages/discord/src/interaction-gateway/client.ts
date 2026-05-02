import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  DiscordGatewayDispatchEventCodec,
  DiscordGatewayHeartbeatAckEventCodec,
  DiscordGatewayHelloEventCodec,
} from './codec.js';
import type {
  DiscordGatewayDispatchEvent,
  DiscordGatewayHeartbeatPayload,
  DiscordGatewayIdentifyPayload,
  DiscordInteractionGatewayResult,
} from './codec.js';
import {
  DISCORD_GATEWAY_DEFAULT_URL,
  DISCORD_GATEWAY_HEARTBEAT_OPCODE,
  DISCORD_GATEWAY_IDENTIFY_OPCODE,
} from './constants.js';
import { DiscordInteractionGatewayService } from './service.js';

export interface DiscordGatewayConnection {
  /** Sends a serialized Gateway payload. */
  send(message: string): void;
  /** Closes the Gateway connection. */
  close(): void;
  /** Registers the inbound Gateway message listener. */
  onMessage(listener: (message: string) => void): void;
  /** Registers the Gateway close listener. */
  onClose(listener: () => void): void;
}

export interface DiscordGatewayConnectionFactory {
  /** Opens a Gateway connection to the provided URL. */
  connect(gatewayUrl: string): DiscordGatewayConnection;
}

export interface DiscordGatewayHeartbeatScheduler {
  /** Schedules Gateway heartbeat execution and returns its cancellation hook. */
  schedule(heartbeat: () => void, intervalMs: number): () => void;
}

export interface DiscordGatewayDispatchHandler {
  /** Routes decoded Gateway dispatch events into the Discord control plane. */
  handleDispatch(
    input: DiscordGatewayDispatchEvent,
  ): Promise<DiscordInteractionGatewayResult>;
}

export interface DiscordInteractionGatewayClientStartInput {
  /** Bot token used in the Discord Gateway identify payload. */
  botToken: string;
  /** Discord Gateway URL, usually returned by Discord Gateway discovery. */
  gatewayUrl?: string;
  /** Gateway intents bitset requested by the runtime. */
  intents?: number;
  /** Scheduler used to drive Gateway heartbeats. */
  heartbeatScheduler?: DiscordGatewayHeartbeatScheduler;
  /** Observer for handled, ignored, and rejected interaction dispatches. */
  onResult?: (result: DiscordInteractionGatewayResult) => void;
  /** Observer for asynchronous Gateway message handling failures. */
  onError?: (error: Error) => void;
}

export interface DiscordInteractionGatewayClientSession {
  /** Gateway URL used by the active session. */
  gatewayUrl: string;
  /** Closes the active Gateway session and cancels heartbeats. */
  close(): void;
}

/**
 * Interval-backed heartbeat scheduler for live Gateway sessions.
 */
export class IntervalDiscordGatewayHeartbeatScheduler implements DiscordGatewayHeartbeatScheduler {
  public schedule(heartbeat: () => void, intervalMs: number): () => void {
    const timer = setInterval(heartbeat, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }
}

/**
 * WebSocket-backed Discord Gateway connection for private outbound runtimes.
 */
class WebSocketDiscordGatewayConnection implements DiscordGatewayConnection {
  private readonly socket: WebSocket;

  public constructor(gatewayUrl: string) {
    this.socket = new WebSocket(gatewayUrl);
  }

  public send(message: string): void {
    this.socket.send(message);
  }

  public close(): void {
    this.socket.close();
  }

  public onMessage(listener: (message: string) => void): void {
    this.socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        listener(event.data);
        return;
      }

      listener(String(event.data));
    });
  }

  public onClose(listener: () => void): void {
    this.socket.addEventListener('close', () => {
      listener();
    });
  }
}

/**
 * Default WebSocket connection factory for Discord Gateway sessions.
 */
export class WebSocketDiscordGatewayConnectionFactory implements DiscordGatewayConnectionFactory {
  public connect(gatewayUrl: string): DiscordGatewayConnection {
    return new WebSocketDiscordGatewayConnection(gatewayUrl);
  }
}

/**
 * Parses Gateway messages into unknown JSON payloads.
 */
function parseGatewayMessage(message: string):
  | {
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly ok: false;
    } {
  try {
    return {
      ok: true,
      value: JSON.parse(message),
    };
  } catch {
    return {
      ok: false,
    };
  }
}

/**
 * Builds the Discord identify payload for the current runtime.
 */
function createIdentifyPayload(
  input: DiscordInteractionGatewayClientStartInput,
): DiscordGatewayIdentifyPayload {
  return {
    op: DISCORD_GATEWAY_IDENTIFY_OPCODE,
    d: {
      token: input.botToken,
      intents: input.intents ?? 0,
      properties: {
        $os: 'linux',
        $browser: 'devplat',
        $device: 'devplat',
      },
    },
  };
}

/**
 * Builds the heartbeat payload with the latest dispatch sequence.
 */
function createHeartbeatPayload(
  sequenceNumber: number | null,
): DiscordGatewayHeartbeatPayload {
  return {
    op: DISCORD_GATEWAY_HEARTBEAT_OPCODE,
    d: sequenceNumber,
  };
}

/**
 * Serializes Gateway payloads before writing to the WebSocket.
 */
function sendGatewayPayload(
  connection: DiscordGatewayConnection,
  payload: DiscordGatewayIdentifyPayload | DiscordGatewayHeartbeatPayload,
): void {
  connection.send(JSON.stringify(payload));
}

export class DiscordInteractionGatewayClientService {
  public constructor(
    private readonly connections: DiscordGatewayConnectionFactory = new WebSocketDiscordGatewayConnectionFactory(),
    private readonly handler: DiscordGatewayDispatchHandler = new DiscordInteractionGatewayService(),
  ) {}

  /**
   * Starts an outbound Discord Gateway session for private runtime deployments.
   */
  public start(
    input: DiscordInteractionGatewayClientStartInput,
  ): DiscordInteractionGatewayClientSession {
    const gatewayUrl = input.gatewayUrl ?? DISCORD_GATEWAY_DEFAULT_URL;
    const connection = this.connections.connect(gatewayUrl);
    const scheduler =
      input.heartbeatScheduler ??
      new IntervalDiscordGatewayHeartbeatScheduler();
    let sequenceNumber: number | null = null;
    let cancelHeartbeat: (() => void) | undefined = undefined;

    const reportError = (error: Error): void => {
      input.onError?.(error);
    };
    const sendHeartbeat = (): void => {
      sendGatewayPayload(connection, createHeartbeatPayload(sequenceNumber));
    };
    const stopHeartbeat = (): void => {
      cancelHeartbeat?.();
      cancelHeartbeat = undefined;
    };
    const handleParsedMessage = async (parsed: unknown): Promise<void> => {
      const hello = decodeWithCodec(DiscordGatewayHelloEventCodec, parsed);
      if (hello.ok) {
        stopHeartbeat();
        cancelHeartbeat = scheduler.schedule(
          sendHeartbeat,
          hello.value.d.heartbeat_interval,
        );
        sendGatewayPayload(connection, createIdentifyPayload(input));
        return;
      }

      const heartbeatAck = decodeWithCodec(
        DiscordGatewayHeartbeatAckEventCodec,
        parsed,
      );
      if (heartbeatAck.ok) {
        return;
      }

      const dispatch = decodeWithCodec(
        DiscordGatewayDispatchEventCodec,
        parsed,
      );
      if (!dispatch.ok) {
        return;
      }

      sequenceNumber = dispatch.value.s ?? sequenceNumber;
      const result = await this.handler.handleDispatch(dispatch.value);
      input.onResult?.(result);
    };

    connection.onMessage((message) => {
      const parsed = parseGatewayMessage(message);
      if (!parsed.ok) {
        return;
      }

      handleParsedMessage(parsed.value).catch((error: unknown) => {
        reportError(error instanceof Error ? error : new Error(String(error)));
      });
    });
    connection.onClose(stopHeartbeat);

    return {
      gatewayUrl,
      close: (): void => {
        stopHeartbeat();
        connection.close();
      },
    };
  }
}
