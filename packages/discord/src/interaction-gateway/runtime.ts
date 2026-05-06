import { RuntimeConfigService } from '@vannadii/devplat-config';
import { decodeWithCodec } from '@vannadii/devplat-core';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import { DiscordThreadSessionCodec } from '../thread-session/codec.js';
import type { DiscordThreadSession } from '../thread-session/codec.js';
import {
  DiscordControlPlaneService,
  DiscordRestResponseTransport,
} from '../discord-control-plane/service.js';
import type { DiscordInteractionCallback } from '../discord-control-plane/codec.js';
import { resolveDiscordComponentThreadId } from '../discord-control-plane/logic.js';
import {
  DiscordInteractionGatewayClientService,
  type DiscordGatewayConnectionFactory,
  type DiscordGatewayHeartbeatScheduler,
  type DiscordInteractionGatewayClientSession,
} from './client.js';
import { DiscordInteractionGatewayService } from './service.js';
import type { DiscordInteractionGatewayBindingResolver } from './service.js';

/** Contract for discord interaction gateway runtime dependencies. */
export interface DiscordInteractionGatewayRuntimeDependencies {
  /** Optional preconfigured client used by tests or custom launchers. */
  client?: DiscordInteractionGatewayClientService;
  /** Optional Gateway connection factory for private runtime launchers. */
  connectionFactory?: DiscordGatewayConnectionFactory;
  /** Optional heartbeat scheduler override for deterministic tests. */
  heartbeatScheduler?: DiscordGatewayHeartbeatScheduler;
}

/**
 * Reads persisted Discord thread sessions from the state store.
 */
async function listStoredDiscordThreadSessions(
  store: FileStoreService,
): Promise<DiscordThreadSession[]> {
  const keys = await store.list('state');
  const sessionGroups = await Promise.all(
    keys.map(async (key) => {
      const record = await store.read('state', key);
      if (!record.ok) {
        return [];
      }

      const decoded = decodeWithCodec(
        DiscordThreadSessionCodec,
        record.value.payload,
      );
      return decoded.ok ? [decoded.value] : [];
    }),
  );

  return sessionGroups.flat();
}

/**
 * Reads the thread id encoded into a Discord component callback, when present.
 */
function resolveCallbackComponentThreadId(
  input: DiscordInteractionCallback,
): string | undefined {
  return resolveDiscordComponentThreadId(input.data?.custom_id);
}

/**
 * Returns true when the Discord callback channel can carry a component
 * interaction for the persisted thread session.
 */
function callbackChannelMatchesSession(
  callbackChannelId: string,
  session: DiscordThreadSession,
): boolean {
  return (
    callbackChannelId === session.threadId ||
    callbackChannelId === session.parentChannelId
  );
}

/** Precomputed Discord callback identifiers used while scanning sessions. */
type DiscordGatewayCallbackContext = {
  callbackChannelId: string;
  componentThreadId: string | undefined;
};

/**
 * Returns true when a stored session matches the live callback context.
 */
function sessionMatchesGatewayCallback(
  context: DiscordGatewayCallbackContext,
  session: DiscordThreadSession,
): boolean {
  const channelMatchesThread = session.threadId === context.callbackChannelId;
  const componentMatchesThread = session.threadId === context.componentThreadId;

  return (
    channelMatchesThread ||
    (componentMatchesThread &&
      callbackChannelMatchesSession(context.callbackChannelId, session))
  );
}

/**
 * Resolves Gateway callbacks against persisted bound thread sessions.
 */
export function createStorageBackedDiscordGatewayBindingResolver(
  store: FileStoreService,
): DiscordInteractionGatewayBindingResolver {
  return async (
    input: DiscordInteractionCallback,
  ): ReturnType<DiscordInteractionGatewayBindingResolver> => {
    const callbackContext: DiscordGatewayCallbackContext = {
      callbackChannelId: input.channel_id.trim(),
      componentThreadId: resolveCallbackComponentThreadId(input),
    };
    const sessions = (await listStoredDiscordThreadSessions(store)).filter(
      (session) => sessionMatchesGatewayCallback(callbackContext, session),
    );
    const [session] = sessions;

    if (sessions.length === 1 && session !== undefined) {
      return {
        threadId: session.threadId,
        boundThreadId: session.threadId,
        boundSession: session,
      };
    }

    return {
      threadId: callbackContext.callbackChannelId,
      boundThreadId: sessions.length === 0 ? 'unresolved' : 'ambiguous',
      summary:
        sessions.length === 0
          ? 'Discord Gateway interaction did not resolve a bound thread.'
          : 'Discord Gateway interaction resolved multiple bound threads.',
    };
  };
}

/**
 * Starts the private outbound Discord Gateway runtime from environment config.
 */
export function startDiscordInteractionGatewayRuntimeFromEnvironment(
  env: Record<string, string | undefined> = process.env,
  dependencies: DiscordInteractionGatewayRuntimeDependencies = {},
): DiscordInteractionGatewayClientSession {
  const config = new RuntimeConfigService().fromEnvironment(env);
  const store = new FileStoreService(config.storage.rootDirectory);
  const resolver = createStorageBackedDiscordGatewayBindingResolver(store);
  const controlPlane = new DiscordControlPlaneService(
    new DecisionPolicyService(),
    new TelemetryEventService(store),
    store,
    new DiscordRestResponseTransport(
      config.discord.botToken,
      config.discord.apiBaseUrl,
      fetch,
      config.discord.applicationId,
    ),
  );
  const gatewayHandler = new DiscordInteractionGatewayService(
    controlPlane,
    resolver,
  );
  const client =
    dependencies.client ??
    new DiscordInteractionGatewayClientService(
      dependencies.connectionFactory,
      gatewayHandler,
    );

  return client.start({
    botToken: config.discord.botToken,
    gatewayUrl: config.discord.gatewayUrl,
    intents: config.discord.gatewayIntents,
    ...(dependencies.heartbeatScheduler === undefined
      ? {}
      : { heartbeatScheduler: dependencies.heartbeatScheduler }),
  });
}
