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

type DiscordFetchUrl = string | URL | Request;

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
    async postInteractionCompletion(input) {
      return createReceipt(`/webhooks/application/${input.token}`);
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

class RejectingProjectIdentityReservationStore extends FileStoreService {
  public constructor(rootDirectory: string) {
    super(rootDirectory);
  }

  public override async storeIfAbsent<TPayload extends object>(
    record: StoredRecord<TPayload>,
  ) {
    if (record.key.startsWith('project-identity:')) {
      return {
        ok: false as const,
        error: 'EEXIST: file already exists',
      };
    }
    return super.storeIfAbsent(record);
  }
}

/** Test store that simulates non-EEXIST write failures for identity reservations. */
class FailingProjectIdentityReservationStore extends FileStoreService {
  public constructor(rootDirectory: string) {
    super(rootDirectory);
  }

  public override async storeIfAbsent<TPayload extends object>(
    record: StoredRecord<TPayload>,
  ) {
    if (record.key.startsWith('project-identity:')) {
      return {
        ok: false as const,
        error: 'EACCES: permission denied',
      };
    }
    return super.storeIfAbsent(record);
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
    async postInteractionCompletion(input) {
      events.push(`interaction-completion:${input.id}`);
      return createReceipt(`/webhooks/application/${input.token}`);
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
    async postInteractionCompletion(input) {
      return createReceipt(`/webhooks/application/${input.token}`);
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
    async postInteractionCompletion(input) {
      return createReceipt(`/webhooks/application/${input.token}`);
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
 * Creates a transport that rejects both the thread message and deferred completion.
 */
function createThreadAndCompletionRejectingResponseTransport(): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionDeferred(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionCompletion(input) {
      return {
        endpoint: `/webhooks/application/${input.token}`,
        statusCode: 404,
        responseBody: { message: 'Unknown interaction webhook' },
      };
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
      return {
        endpoint: `/interactions/${input.id}/${input.token}/callback`,
        statusCode: 404,
        responseBody: { message: 'Unknown interaction' },
      };
    },
    async postInteractionCompletion(input) {
      return createReceipt(`/webhooks/application/${input.token}`);
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
    async postInteractionDeferred() {
      throw error;
    },
    async postInteractionCompletion(input) {
      return createReceipt(`/webhooks/application/${input.token}`);
    },
    async postThreadMessage(threadId) {
      return createReceipt(`/channels/${threadId}/messages`);
    },
  };
}

/**
 * Creates a transport that returns a rejected deferred-completion receipt.
 */
function createCompletionRejectingResponseTransport(): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionDeferred(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionCompletion(input) {
      return {
        endpoint: `/webhooks/application/${input.token}`,
        statusCode: 404,
        responseBody: { message: 'Unknown interaction webhook' },
      };
    },
    async postThreadMessage(threadId) {
      return createReceipt(`/channels/${threadId}/messages`);
    },
  };
}

/**
 * Creates a transport that throws while completing a deferred interaction.
 */
function createCompletionThrowingResponseTransport(
  error: unknown,
): DiscordControlResponseTransport {
  return {
    async postInteractionResponse(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionDeferred(input) {
      return createReceipt(`/interactions/${input.id}/${input.token}/callback`);
    },
    async postInteractionCompletion() {
      throw error;
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

  it('keeps open-project intent immutable per thread context', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const first = await service.handleAction({
      id: 'discord-004a',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4a',
      threadId: 'thread-4a',
      channelId: 'channel-4a',
      action: 'open-project',
      privileged: false,
    });
    const second = await service.handleAction({
      id: 'discord-004b',
      summary: 'open-project (intent:bugfix)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-4a',
      threadId: 'thread-4a',
      channelId: 'channel-4a',
      action: 'open-project',
      privileged: false,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.failedClosed).toBe(true);
    expect(await store.list('state')).toContain(
      'open-project-intent:thread-4a',
    );
    expect(await store.list('audit')).toContain('discord-004b:audit');
  });

  it('uses the final intent marker when summaries include earlier marker-like text', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const first = await service.handleAction({
      id: 'discord-004a-last-marker',
      summary:
        'open-project (repo:devplat[intent:spoof]) (project:alpha) (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4a-last-marker',
      threadId: 'thread-4a-last-marker',
      channelId: 'channel-4a-last-marker',
      action: 'open-project',
      privileged: false,
    });
    const second = await service.handleAction({
      id: 'discord-004b-last-marker',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-4a-last-marker',
      threadId: 'thread-4a-last-marker',
      channelId: 'channel-4a-last-marker',
      action: 'open-project',
      privileged: false,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    const persisted = await store.read(
      'state',
      'open-project-intent:thread-4a-last-marker',
    );
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.value.payload).toMatchObject({
        intent: 'maintenance',
      });
    }
  });

  it('does not persist open-project immutable intent state when policy blocks the action', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const blocked = await service.handleAction({
      id: 'discord-004a-blocked',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4a-blocked',
      threadId: 'thread-4a-blocked',
      channelId: 'channel-4a-blocked',
      action: 'open-project',
      privileged: true,
    });

    expect(blocked.allowed).toBe(false);
    expect(await store.list('state')).not.toContain(
      'open-project-intent:thread-4a-blocked',
    );
  });

  it('enforces new-project uniqueness per repo across thread contexts', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const first = await service.handleAction({
      id: 'discord-004-new-project-a',
      summary: 'new-project (repo:devplat) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-a',
      threadId: 'thread-new-project-a',
      channelId: 'channel-new-project-a',
      action: 'new-project',
      privileged: false,
    });
    const duplicate = await service.handleAction({
      id: 'discord-004-new-project-b',
      summary: 'new-project (repo:devplat) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-new-project-b',
      threadId: 'thread-new-project-b',
      channelId: 'channel-new-project-b',
      action: 'new-project',
      privileged: false,
      workItem: {
        threadKind: 'implementation',
        threadId: 'thread-new-project-b',
        artifactId: 'artifact-duplicate',
        sliceId: 'slice-duplicate',
      },
    });

    expect(first.allowed).toBe(true);
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.failedClosed).toBe(true);
    expect(await store.list('audit')).toContain(
      'discord-004-new-project-b:audit',
    );
  });

  it('does not reserve new-project identity state when policy blocks new-project', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const blocked = await service.handleAction({
      id: 'discord-004-new-project-blocked',
      summary: 'new-project (repo:devplat) (project:blocked)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-blocked',
      threadId: 'thread-new-project-blocked',
      channelId: 'channel-new-project-blocked',
      action: 'new-project',
      privileged: true,
    });

    expect(blocked.allowed).toBe(false);
    expect(await store.list('state')).not.toContain(
      'project-identity:devplat:blocked',
    );
  });

  it('fails closed for duplicate new-project identity without a bound work item', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await service.handleAction({
      id: 'discord-004-new-project-no-work-item-a',
      summary: 'new-project (repo:devplat) (project:gamma)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-no-work-item-a',
      threadId: 'thread-new-project-no-work-item-a',
      channelId: 'channel-new-project-no-work-item-a',
      action: 'new-project',
      privileged: false,
    });

    const duplicate = await service.handleAction({
      id: 'discord-004-new-project-no-work-item-b',
      summary: 'new-project (repo:devplat) (project:gamma)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-new-project-no-work-item-b',
      threadId: 'thread-new-project-no-work-item-b',
      channelId: 'channel-new-project-no-work-item-b',
      action: 'new-project',
      privileged: false,
    });

    expect(duplicate.allowed).toBe(false);
    expect(duplicate.failedClosed).toBe(true);
  });

  it('allows duplicate new-project identity within the same thread context', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await service.handleAction({
      id: 'discord-004-new-project-same-thread-a',
      summary: 'new-project (repo:devplat) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-same-thread-a',
      threadId: 'thread-new-project-same-thread',
      channelId: 'channel-new-project-same-thread',
      action: 'new-project',
      privileged: false,
    });

    const retry = await service.handleAction({
      id: 'discord-004-new-project-same-thread-b',
      summary: 'new-project (repo:devplat) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-new-project-same-thread-b',
      threadId: 'thread-new-project-same-thread',
      channelId: 'channel-new-project-same-thread',
      action: 'new-project',
      privileged: false,
    });

    expect(retry.allowed).toBe(true);
    expect(retry.failedClosed).toBe(false);
  });

  it('allows new-project when project identity markers are incomplete in summary', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-incomplete-markers',
      summary: 'new-project (repo:devplat) (project:alpha',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-incomplete-markers',
      threadId: 'thread-new-project-incomplete-markers',
      channelId: 'channel-new-project-incomplete-markers',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
    expect(await store.list('state')).not.toContain(
      'project-identity:devplat:alpha',
    );
  });

  it('allows non new-project actions without identity reservations', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-non-new-project',
      summary: 'retry gates',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-non-new-project',
      threadId: 'thread-non-new-project',
      channelId: 'channel-non-new-project',
      action: 'retry-gates',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(await store.list('state')).not.toContain(
      'project-identity:devplat:alpha',
    );
  });

  it('fails closed when project identity reservation collides at write time', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new RejectingProjectIdentityReservationStore(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-write-collision',
      summary: 'new-project (repo:devplat) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-write-collision',
      threadId: 'thread-new-project-write-collision',
      channelId: 'channel-new-project-write-collision',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
  });

  it('fails closed when project identity reservation write fails unexpectedly', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FailingProjectIdentityReservationStore(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-write-failure',
      summary: 'new-project (repo:devplat) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-write-failure',
      threadId: 'thread-new-project-write-failure',
      channelId: 'channel-new-project-write-failure',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
  });

  it('fails closed when project identity exists without a bound thread marker', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await store.store({
      id: 'seed-identity-missing-thread',
      key: 'project-identity:devplat:alpha',
      scope: 'state',
      summary: 'Project identity reservation.',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        repo: 'devplat',
        project: 'alpha',
      },
    });

    const result = await service.handleAction({
      id: 'discord-004-new-project-existing-identity-no-thread',
      summary: 'new-project (repo:devplat) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-new-project-existing-identity-no-thread',
      threadId: 'thread-new-project-existing-identity-no-thread',
      channelId: 'channel-new-project-existing-identity-no-thread',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
  });

  it('allows new-project when repo marker is missing from summary', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-missing-repo',
      summary: 'new-project (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-missing-repo',
      threadId: 'thread-new-project-missing-repo',
      channelId: 'channel-new-project-missing-repo',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('allows new-project when repo marker is unterminated in summary', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-unterminated-repo',
      summary: 'new-project (repo:devplat',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-unterminated-repo',
      threadId: 'thread-new-project-unterminated-repo',
      channelId: 'channel-new-project-unterminated-repo',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('allows new-project when project marker is missing from summary', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-missing-project',
      summary: 'new-project (repo:devplat)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-missing-project',
      threadId: 'thread-new-project-missing-project',
      channelId: 'channel-new-project-missing-project',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('allows new-project when repo marker value is blank in summary', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-blank-repo',
      summary: 'new-project (repo: ) (project:alpha)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-blank-repo',
      threadId: 'thread-new-project-blank-repo',
      channelId: 'channel-new-project-blank-repo',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('allows new-project when project marker value is blank in summary', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004-new-project-blank-project',
      summary: 'new-project (repo:devplat) (project: )',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-new-project-blank-project',
      threadId: 'thread-new-project-blank-project',
      channelId: 'channel-new-project-blank-project',
      action: 'new-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('fails closed on routed interactions when open-project intent changes for a thread', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createResponseTransport(),
    );

    await service.handleAction({
      id: 'discord-004e',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4e',
      threadId: 'thread-4e',
      channelId: 'channel-4e',
      action: 'open-project',
      privileged: false,
    });

    const result = await service.handleInteraction({
      id: 'interaction-004e',
      token: 'token-004e',
      actorId: 'user-4e',
      channelId: 'channel-4e',
      updatedAt: '2026-04-04T00:00:01.000Z',
      commandName: 'open-project',
      boundThreadId: 'thread-4e',
      projectRepo: 'devplat',
      projectName: 'alpha',
      openProjectIntent: 'bugfix',
      actorRoleIds: ['role-project-operator'],
      projectOperatorRoleId: 'role-project-operator',
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
    expect(result.responsePayload?.content).toContain(
      'Reason: open-project intent is immutable for this run: expected maintenance, received bugfix.',
    );
    expect(result.threadReceipt?.endpoint).toBe('/channels/thread-4e/messages');
    expect(await store.list('audit')).toContain('interaction-004e:audit');
  });

  it('fails closed when intent mismatch acknowledgement is rejected by Discord', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createAcknowledgementRejectingResponseTransport(),
    );

    await service.handleAction({
      id: 'discord-004f',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4f',
      threadId: 'thread-4f',
      channelId: 'channel-4f',
      action: 'open-project',
      privileged: false,
    });

    const result = await service.handleInteraction({
      id: 'interaction-004f',
      token: 'token-004f',
      actorId: 'user-4f',
      channelId: 'channel-4f',
      updatedAt: '2026-04-04T00:00:01.000Z',
      commandName: 'open-project',
      boundThreadId: 'thread-4f',
      projectRepo: 'devplat',
      projectName: 'alpha',
      openProjectIntent: 'bugfix',
      actorRoleIds: ['role-project-operator'],
      projectOperatorRoleId: 'role-project-operator',
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
    expect(result.responsePostError).toBe(
      'Discord interaction deferred acknowledgement returned HTTP 404.',
    );
    expect(result.responseReceipt?.statusCode).toBe(404);
  });

  it('reports routed intent mismatch failures when deferred acknowledgement transport throws', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createAcknowledgementThrowingResponseTransport(
        'Discord intent-mismatch acknowledgement network failure',
      ),
    );

    await service.handleAction({
      id: 'discord-004f-1',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4f-1',
      threadId: 'thread-4f-1',
      channelId: 'channel-4f-1',
      action: 'open-project',
      privileged: false,
    });

    const result = await service.handleInteraction({
      id: 'interaction-004f-1',
      token: 'token-004f-1',
      actorId: 'user-4f-1',
      channelId: 'channel-4f-1',
      updatedAt: '2026-04-04T00:00:01.000Z',
      commandName: 'open-project',
      boundThreadId: 'thread-4f-1',
      projectRepo: 'devplat',
      projectName: 'alpha',
      openProjectIntent: 'bugfix',
      actorRoleIds: ['role-project-operator'],
      projectOperatorRoleId: 'role-project-operator',
      boundSession: {
        id: 'thread-session-4f-1',
        summary: 'Implementation session',
        status: 'running',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-4f-1',
        channelId: 'thread-4f-1',
        parentChannelId: 'implementation-channel',
        threadId: 'thread-4f-1',
        kind: 'implementation',
        specId: 'spec-4f-1',
        sliceId: 'slice-4f-1',
        pullRequestNumber: null,
        artifactId: 'artifact-4f-1',
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
    expect(result.responseReceipt).toBeUndefined();
    expect(result.responsePostError).toBe(
      'Discord intent-mismatch acknowledgement network failure',
    );
  });

  it('reports routed intent mismatch failures when thread posting is rejected after acknowledgement', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createThreadRejectingResponseTransport(),
    );

    await service.handleAction({
      id: 'discord-004f-2',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4f-2',
      threadId: 'thread-4f-2',
      channelId: 'channel-4f-2',
      action: 'open-project',
      privileged: false,
    });

    const result = await service.handleInteraction({
      id: 'interaction-004f-2',
      token: 'token-004f-2',
      actorId: 'user-4f-2',
      channelId: 'channel-4f-2',
      updatedAt: '2026-04-04T00:00:01.000Z',
      commandName: 'open-project',
      boundThreadId: 'thread-4f-2',
      projectRepo: 'devplat',
      projectName: 'alpha',
      openProjectIntent: 'bugfix',
      actorRoleIds: ['role-project-operator'],
      projectOperatorRoleId: 'role-project-operator',
      boundSession: {
        id: 'thread-session-4f-2',
        summary: 'Implementation session',
        status: 'running',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-4f-2',
        channelId: 'thread-4f-2',
        parentChannelId: 'implementation-channel',
        threadId: 'thread-4f-2',
        kind: 'implementation',
        specId: 'spec-4f-2',
        sliceId: 'slice-4f-2',
        pullRequestNumber: null,
        artifactId: 'artifact-4f-2',
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
    expect(result.responseReceipt?.statusCode).toBe(200);
    expect(result.threadReceipt?.statusCode).toBe(403);
    expect(result.threadPostError).toContain(
      'Discord thread status message returned HTTP 403.',
    );
  });

  it('reports routed intent mismatch failures when thread posting throws after acknowledgement', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createThreadFailingResponseTransport(
        'Discord thread status message network failure',
      ),
    );

    await service.handleAction({
      id: 'discord-004f-3',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4f-3',
      threadId: 'thread-4f-3',
      channelId: 'channel-4f-3',
      action: 'open-project',
      privileged: false,
    });

    const result = await service.handleInteraction({
      id: 'interaction-004f-3',
      token: 'token-004f-3',
      actorId: 'user-4f-3',
      channelId: 'channel-4f-3',
      updatedAt: '2026-04-04T00:00:01.000Z',
      commandName: 'open-project',
      boundThreadId: 'thread-4f-3',
      projectRepo: 'devplat',
      projectName: 'alpha',
      openProjectIntent: 'bugfix',
      actorRoleIds: ['role-project-operator'],
      projectOperatorRoleId: 'role-project-operator',
      boundSession: {
        id: 'thread-session-4f-3',
        summary: 'Implementation session',
        status: 'running',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-4f-3',
        channelId: 'thread-4f-3',
        parentChannelId: 'implementation-channel',
        threadId: 'thread-4f-3',
        kind: 'implementation',
        specId: 'spec-4f-3',
        sliceId: 'slice-4f-3',
        pullRequestNumber: null,
        artifactId: 'artifact-4f-3',
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
    expect(result.responseReceipt?.statusCode).toBe(200);
    expect(result.threadReceipt).toBeUndefined();
    expect(result.threadPostError).toBe(
      'Discord thread status message network failure',
    );
  });

  it('accepts open-project intents when persisted thread intent payload is unavailable', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await store.store({
      id: 'record-open-project-intent-thread-4g',
      key: 'open-project-intent:thread-4g',
      scope: 'state',
      summary: 'Open-project immutable intent binding.',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {},
    });

    const result = await service.handleAction({
      id: 'discord-004g',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-4g',
      threadId: 'thread-4g',
      channelId: 'channel-4g',
      action: 'open-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('accepts open-project intents when persisted thread intent payload is non-string', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await store.store({
      id: 'record-open-project-intent-thread-4g-non-string',
      key: 'open-project-intent:thread-4g-non-string',
      scope: 'state',
      summary: 'Open-project immutable intent binding.',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        intent: 42,
      },
    });

    const result = await service.handleAction({
      id: 'discord-004g-non-string',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-4g-non-string',
      threadId: 'thread-4g-non-string',
      channelId: 'channel-4g-non-string',
      action: 'open-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('accepts open-project intents when persisted thread intent payload is blank', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await store.store({
      id: 'record-open-project-intent-thread-4g-blank',
      key: 'open-project-intent:thread-4g-blank',
      scope: 'state',
      summary: 'Open-project immutable intent binding.',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        intent: '   ',
      },
    });

    const result = await service.handleAction({
      id: 'discord-004g-blank',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-4g-blank',
      threadId: 'thread-4g-blank',
      channelId: 'channel-4g-blank',
      action: 'open-project',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.failedClosed).toBe(false);
  });

  it('fails closed when open-project summary omits an intent marker', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004h',
      summary: 'open-project',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4h',
      threadId: 'thread-4h',
      channelId: 'channel-4h',
      action: 'open-project',
      privileged: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
  });

  it('records intent-mismatch audits with artifact context when work items are present', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const first = await service.handleAction({
      id: 'discord-004h-artifact-1',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4h-artifact',
      threadId: 'thread-4h-artifact',
      channelId: 'channel-4h-artifact',
      action: 'open-project',
      privileged: false,
      workItem: {
        threadKind: 'implementation',
        threadId: 'thread-4h-artifact',
        sliceId: 'slice-4h-artifact',
        artifactId: 'artifact-4h-artifact',
      },
    });

    const second = await service.handleAction({
      id: 'discord-004h-artifact-2',
      summary: 'open-project (intent:bugfix)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-4h-artifact',
      threadId: 'thread-4h-artifact',
      channelId: 'channel-4h-artifact',
      action: 'open-project',
      privileged: false,
      workItem: {
        threadKind: 'implementation',
        threadId: 'thread-4h-artifact',
        sliceId: 'slice-4h-artifact',
        artifactId: 'artifact-4h-artifact',
      },
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    const auditRecord = await store.read(
      'audit',
      'discord-004h-artifact-2:audit',
    );
    expect(auditRecord.ok).toBe(true);
    if (auditRecord.ok) {
      expect(auditRecord.value.payload).toMatchObject({
        artifactIds: ['artifact-4h-artifact'],
      });
    }
  });

  it('fails closed when open-project summary contains an unterminated intent marker', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004i',
      summary: 'open-project (intent:maintenance',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4i',
      threadId: 'thread-4i',
      channelId: 'channel-4i',
      action: 'open-project',
      privileged: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
  });

  it('fails closed when open-project summary contains an empty intent marker', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    const result = await service.handleAction({
      id: 'discord-004i-empty',
      summary: 'open-project (intent: )',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4i-empty',
      threadId: 'thread-4i-empty',
      channelId: 'channel-4i-empty',
      action: 'open-project',
      privileged: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.failedClosed).toBe(true);
  });

  it('resets malformed persisted config versions to v1 on project settings updates', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await service.handleAction({
      id: 'discord-004j',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4j',
      threadId: 'thread-4j',
      channelId: 'channel-4j',
      action: 'open-project',
      privileged: false,
    });
    await store.store({
      id: 'record-project-config-thread-4j',
      key: 'project-config-version:thread-4j',
      scope: 'state',
      summary: 'Project config version.',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      payload: {
        threadId: 'thread-4j',
        action: 'project-settings',
        configVersion: 'x2',
      },
    });

    const result = await service.handleAction({
      id: 'discord-004j-settings',
      summary: 'project settings update',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:02.000Z',
      actorId: 'user-4j',
      threadId: 'thread-4j',
      channelId: 'channel-4j',
      action: 'project-settings',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    const persisted = await store.read(
      'state',
      'project-config-version:thread-4j',
    );
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.value.payload).toMatchObject({
        configVersion: 'v1',
      });
    }
  });

  it('resets invalid numeric config versions to v1 on project settings updates', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await store.store({
      id: 'record-project-config-thread-4j-v0',
      key: 'project-config-version:thread-4j-v0',
      scope: 'state',
      summary: 'Project config version.',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      payload: {
        threadId: 'thread-4j-v0',
        action: 'project-settings',
        configVersion: 'v0',
      },
    });

    const result = await service.handleAction({
      id: 'discord-004j-v0-settings',
      summary: 'project settings update',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:02.000Z',
      actorId: 'user-4j-v0',
      threadId: 'thread-4j-v0',
      channelId: 'channel-4j-v0',
      action: 'project-settings',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    const persisted = await store.read(
      'state',
      'project-config-version:thread-4j-v0',
    );
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.value.payload).toMatchObject({
        configVersion: 'v1',
      });
    }
  });

  it('increments valid persisted config versions on project settings updates', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await store.store({
      id: 'record-project-config-thread-4j-v2',
      key: 'project-config-version:thread-4j-v2',
      scope: 'state',
      summary: 'Project config version.',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      payload: {
        threadId: 'thread-4j-v2',
        action: 'project-settings',
        configVersion: 'v2',
      },
    });

    const result = await service.handleAction({
      id: 'discord-004j-v2-settings',
      summary: 'project settings update',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:02.000Z',
      actorId: 'user-4j-v2',
      threadId: 'thread-4j-v2',
      channelId: 'channel-4j-v2',
      action: 'project-settings',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    const persisted = await store.read(
      'state',
      'project-config-version:thread-4j-v2',
    );
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.value.payload).toMatchObject({
        configVersion: 'v3',
      });
    }
  });

  it('resets non-safe numeric config versions to v1 on project settings updates', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
    );

    await store.store({
      id: 'record-project-config-thread-4j-overflow',
      key: 'project-config-version:thread-4j-overflow',
      scope: 'state',
      summary: 'Project config version.',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      payload: {
        threadId: 'thread-4j-overflow',
        action: 'project-settings',
        configVersion: 'v9007199254740993',
      },
    });

    const result = await service.handleAction({
      id: 'discord-004j-overflow-settings',
      summary: 'project settings update',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:02.000Z',
      actorId: 'user-4j-overflow',
      threadId: 'thread-4j-overflow',
      channelId: 'channel-4j-overflow',
      action: 'project-settings',
      privileged: false,
    });

    expect(result.allowed).toBe(true);
    const persisted = await store.read(
      'state',
      'project-config-version:thread-4j-overflow',
    );
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.value.payload).toMatchObject({
        configVersion: 'v1',
      });
    }
  });

  it('hydrates show-status metadata from persisted project state', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createResponseTransport(),
    );

    await service.handleAction({
      id: 'discord-004c',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4c',
      threadId: 'thread-4c',
      channelId: 'channel-4c',
      action: 'open-project',
      privileged: false,
    });
    await service.handleAction({
      id: 'discord-004d',
      summary: 'project settings update',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:01.000Z',
      actorId: 'user-4c',
      threadId: 'thread-4c',
      channelId: 'channel-4c',
      action: 'project-settings',
      privileged: false,
    });

    const result = await service.handleInteraction({
      id: 'interaction-004c',
      token: 'token-004c',
      actorId: 'user-4c',
      channelId: 'channel-4c',
      updatedAt: '2026-04-04T00:00:02.000Z',
      commandName: 'show-status',
      boundThreadId: 'thread-4c',
    });

    expect(result.allowed).toBe(true);
    expect(result.responsePayload?.content).toContain(
      'Run intent: maintenance',
    );
    expect(result.responsePayload?.content).toContain('Config version: v1');
  });

  it('renders show-last-artifact interactions with artifact interpretation text', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createResponseTransport(),
    );

    await service.handleAction({
      id: 'discord-004c-artifact',
      summary: 'open-project (intent:maintenance)',
      status: 'running',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      actorId: 'user-4c-artifact',
      threadId: 'thread-4c-artifact',
      channelId: 'channel-4c-artifact',
      action: 'open-project',
      privileged: false,
    });

    const result = await service.handleInteraction({
      id: 'interaction-004c-artifact',
      token: 'token-004c-artifact',
      actorId: 'user-4c-artifact',
      channelId: 'channel-4c-artifact',
      updatedAt: '2026-04-04T00:00:02.000Z',
      commandName: 'show-last-artifact',
      boundThreadId: 'thread-4c-artifact',
    });

    expect(result.allowed).toBe(true);
    expect(result.responsePayload?.content).toContain('Last artifact');
    expect(result.responsePayload?.content).toContain('Why this matters now:');
  });

  it('ignores non-string persisted metadata values when hydrating status summaries', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-discord-'));
    const store = new FileStoreService(rootDirectory);
    const service = new DiscordControlPlaneService(
      new DecisionPolicyService(),
      new TelemetryEventService(store),
      store,
      createResponseTransport(),
    );

    await store.store({
      id: 'record-open-project-intent-thread-4m-non-string',
      key: 'open-project-intent:thread-4m-non-string',
      scope: 'state',
      summary: 'Open-project immutable intent binding.',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        intent: 7,
      },
    });
    await store.store({
      id: 'record-project-config-version-thread-4m-non-string',
      key: 'project-config-version:thread-4m-non-string',
      scope: 'state',
      summary: 'Project config version.',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        configVersion: false,
      },
    });

    const result = await service.handleInteraction({
      id: 'interaction-004m-non-string',
      token: 'token-004m-non-string',
      actorId: 'user-4m-non-string',
      channelId: 'channel-4m-non-string',
      updatedAt: '2026-04-04T00:00:02.000Z',
      commandName: 'show-status',
      boundThreadId: 'thread-4m-non-string',
    });

    expect(result.allowed).toBe(true);
    expect(result.responsePayload?.content).not.toContain('Run intent:');
    expect(result.responsePayload?.content).not.toContain('Config version:');
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
        name: 'defers accepted thread interactions before posting the structured thread result',
        inputs: {
          interaction: {
            id: 'interaction-deferred-001',
            token: 'token-deferred-1',
            actorId: 'user-deferred-1',
            channelId: 'channel-deferred-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'retry gates',
            threadId: 'thread-deferred-1',
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
          const store = new FileStoreService(rootDirectory);
          const events: string[] = [];
          return {
            events,
            store,
            service: new DiscordControlPlaneService(
              new DecisionPolicyService(),
              new TelemetryEventService(store),
              store,
              {
                async postInteractionResponse(input) {
                  events.push(`interaction-response:${input.id}`);
                  return createReceipt(
                    `/interactions/${input.id}/${input.token}/callback`,
                  );
                },
                async postInteractionDeferred(input) {
                  events.push(`interaction-deferred:${input.id}`);
                  return createReceipt(
                    `/interactions/${input.id}/${input.token}/callback`,
                  );
                },
                async postInteractionCompletion(input, payload) {
                  events.push(
                    `interaction-completion:${input.id}:${payload.content}`,
                  );
                  return createReceipt(`/webhooks/application/${input.token}`);
                },
                async postThreadMessage(threadId, payload) {
                  events.push(`thread-message:${threadId}:${payload.content}`);
                  return createReceipt(`/channels/${threadId}/messages`);
                },
              },
            ),
          };
        },
        assert: async (
          context: {
            events: string[];
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
          expect(result.responsePayload?.content).toContain(
            'DevPlat · Gates retry queued',
          );
          expect(context.events[0]).toBe(
            'interaction-deferred:interaction-deferred-001',
          );
          expect(context.events).not.toContain(
            'interaction-response:interaction-deferred-001',
          );
          expect(context.events.join('\n')).toContain(
            'thread-message:thread-deferred-1:🟡 DevPlat · Gates retry queued',
          );
          expect(context.events.join('\n')).toContain(
            'interaction-completion:interaction-deferred-001:ℹ️ DevPlat · Interaction completed',
          );
          expect(result.completionReceipt?.endpoint).toBe(
            '/webhooks/application/token-deferred-1',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-deferred-001',
          );
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
                async postInteractionCompletion(input) {
                  return createReceipt(`/webhooks/application/${input.token}`);
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

  describe('interaction acknowledgement ordering', () => {
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
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
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
            'interaction-deferred:interaction-ack-001',
          );
          expect(context.events).toContain('store:state:interaction-ack-001');
          expect(context.events).toContain('thread-message:thread-ack-1');
        },
      },
      {
        name: 'acknowledges component interactions without creating loaders',
        inputs: {
          interaction: {
            id: 'interaction-ack-component-001',
            token: 'token-ack-component-1',
            actorId: 'user-ack-component-1',
            channelId: 'channel-ack-component-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:show-status:thread-ack-component-1',
            threadId: 'thread-ack-component-1',
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
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
          },
        ) => {
          const result = await context.service.handleInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(true);
          expect(context.events[0]).toBe(
            'interaction-deferred:interaction-ack-component-001',
          );
          expect(context.events).toContain(
            'store:state:interaction-ack-component-001',
          );
          expect(context.events).toContain(
            'thread-message:thread-ack-component-1',
          );
          expect(context.events).not.toContain(
            'interaction-completion:interaction-ack-component-001',
          );
          expect(result.completionReceipt).toBeUndefined();
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
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
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
            'interaction-deferred:interaction-ack-002',
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

    it.each(cases)('$name', async ({ inputs, mock, assert }) => {
      const context = await mock();
      await assert(context, inputs);
    });
  });

  describe('interaction completion failures', () => {
    const cases = [
      {
        name: 'reports completion rejection after the bound thread post succeeds',
        inputs: {
          interaction: {
            id: 'interaction-completion-failure-001',
            token: 'token-completion-failure-1',
            actorId: 'user-completion-failure-1',
            channelId: 'channel-completion-failure-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-completion-failure-1',
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
              createCompletionRejectingResponseTransport(),
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
          expect(result.failedClosed).toBe(false);
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-completion-failure-1/messages',
          );
          expect(result.completionReceipt?.statusCode).toBe(404);
          expect(result.completionPostError).toBe(
            'Discord interaction completion returned HTTP 404.',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-completion-failure-001',
          );
        },
      },
      {
        name: 'reports completion transport errors after the bound thread post succeeds',
        inputs: {
          interaction: {
            id: 'interaction-completion-failure-002',
            token: 'token-completion-failure-2',
            actorId: 'user-completion-failure-2',
            channelId: 'channel-completion-failure-2',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-completion-failure-2',
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
              createCompletionThrowingResponseTransport(
                new Error('Discord completion network failure'),
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

          expect(result.allowed).toBe(true);
          expect(result.failedClosed).toBe(false);
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-completion-failure-2/messages',
          );
          expect(result.completionReceipt).toBeUndefined();
          expect(result.completionPostError).toBe(
            'Discord completion network failure',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-completion-failure-002',
          );
        },
      },
    ];

    it.each(cases)('$name', async ({ inputs, mock, assert }) => {
      const context = await mock();
      await assert(context, inputs);
    });
  });

  describe('acknowledged interaction durable work', () => {
    const cases = [
      {
        name: 'records route failures after an HTTP webhook has already acknowledged Discord',
        inputs: {
          interaction: {
            id: 'interaction-acknowledged-route-failure-001',
            token: 'token-acknowledged-route-failure-1',
            actorId: 'user-acknowledged-route-failure-1',
            channelId: 'channel-acknowledged-route-failure-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            threadId: 'thread-acknowledged-route-failure-1',
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
              createObservedResponseTransport([]),
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
          const result = await context.service.handleAcknowledgedInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(false);
          expect(result.failedClosed).toBe(true);
          expect(result.request.threadId).toBe('unresolved');
          expect(result.responseReceipt).toBeUndefined();
          expect(await context.store.list('state')).not.toContain(
            'interaction-acknowledged-route-failure-001',
          );
          expect(await context.store.list('audit')).toContain(
            'interaction-acknowledged-route-failure-001:audit',
          );
        },
      },
      {
        name: 'posts slash-command work after an HTTP webhook acknowledgement without a second initial callback',
        inputs: {
          interaction: {
            id: 'interaction-acknowledged-slash-001',
            token: 'token-acknowledged-slash-1',
            actorId: 'user-acknowledged-slash-1',
            channelId: 'channel-acknowledged-slash-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-acknowledged-slash-1',
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
          const events: string[] = [];
          const store = new ObservedFileStoreService(rootDirectory, events);
          return {
            events,
            store,
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
            store: FileStoreService;
            service: DiscordControlPlaneService;
          },
          inputs: {
            interaction: DiscordOperatorInteraction;
          },
        ) => {
          const result = await context.service.handleAcknowledgedInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(true);
          expect(result.failedClosed).toBe(false);
          expect(result.responseReceipt).toBeUndefined();
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-acknowledged-slash-1/messages',
          );
          expect(result.completionReceipt?.endpoint).toBe(
            '/webhooks/application/token-acknowledged-slash-1',
          );
          expect(context.events).not.toContain(
            'interaction-deferred:interaction-acknowledged-slash-001',
          );
          expect(context.events).not.toContain(
            'interaction-response:interaction-acknowledged-slash-001',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-acknowledged-slash-001',
          );
        },
      },
      {
        name: 'posts component work after an HTTP webhook acknowledgement without a follow-up completion',
        inputs: {
          interaction: {
            id: 'interaction-acknowledged-component-001',
            token: 'token-acknowledged-component-1',
            actorId: 'user-acknowledged-component-1',
            channelId: 'channel-acknowledged-component-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:show-status:thread-acknowledged-component-1',
            threadId: 'thread-acknowledged-component-1',
          } satisfies DiscordOperatorInteraction,
        },
        mock: async () => {
          const rootDirectory = await mkdtemp(
            join(tmpdir(), 'devplat-discord-'),
          );
          const events: string[] = [];
          const store = new ObservedFileStoreService(rootDirectory, events);
          return {
            events,
            store,
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
            store: FileStoreService;
            service: DiscordControlPlaneService;
          },
          inputs: {
            interaction: DiscordOperatorInteraction;
          },
        ) => {
          const result = await context.service.handleAcknowledgedInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(true);
          expect(result.failedClosed).toBe(false);
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-acknowledged-component-1/messages',
          );
          expect(result.completionReceipt).toBeUndefined();
          expect(context.events).not.toContain(
            'interaction-completion:interaction-acknowledged-component-001',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-acknowledged-component-001',
          );
        },
      },
      {
        name: 'posts blocked policy decisions after an HTTP webhook acknowledgement',
        inputs: {
          interaction: {
            id: 'interaction-acknowledged-blocked-001',
            token: 'token-acknowledged-blocked-1',
            actorId: 'user-acknowledged-blocked-1',
            channelId: 'channel-acknowledged-blocked-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'release worktree',
            threadId: 'thread-acknowledged-blocked-1',
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
          inputs: {
            interaction: DiscordOperatorInteraction;
          },
        ) => {
          const result = await context.service.handleAcknowledgedInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(false);
          expect(result.failedClosed).toBe(false);
          expect(result.responsePayload?.content).toContain(
            'DevPlat · Action blocked',
          );
          expect(result.threadReceipt?.endpoint).toBe(
            '/channels/thread-acknowledged-blocked-1/messages',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-acknowledged-blocked-001',
          );
        },
      },
      {
        name: 'reports post-acknowledgement thread rejection receipts',
        inputs: {
          interaction: {
            id: 'interaction-acknowledged-thread-rejection-001',
            token: 'token-acknowledged-thread-rejection-1',
            actorId: 'user-acknowledged-thread-rejection-1',
            channelId: 'channel-acknowledged-thread-rejection-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-acknowledged-thread-rejection-1',
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
          const result = await context.service.handleAcknowledgedInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(true);
          expect(result.threadReceipt?.statusCode).toBe(403);
          expect(result.threadPostError).toBe(
            'Discord thread status message returned HTTP 403.',
          );
          expect(result.completionReceipt?.endpoint).toBe(
            '/webhooks/application/token-acknowledged-thread-rejection-1',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-acknowledged-thread-rejection-001',
          );
        },
      },
      {
        name: 'reports post-acknowledgement thread transport failures',
        inputs: {
          interaction: {
            id: 'interaction-acknowledged-thread-failure-001',
            token: 'token-acknowledged-thread-failure-1',
            actorId: 'user-acknowledged-thread-failure-1',
            channelId: 'channel-acknowledged-thread-failure-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-acknowledged-thread-failure-1',
          } satisfies DiscordOperatorInteraction,
          error: 'post-ack thread failure',
        },
        mock: async (inputs: { error: unknown }) => {
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
            error: string;
          },
        ) => {
          const result = await context.service.handleAcknowledgedInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(true);
          expect(result.threadReceipt).toBeUndefined();
          expect(result.threadPostError).toBe(inputs.error);
          expect(result.completionReceipt?.endpoint).toBe(
            '/webhooks/application/token-acknowledged-thread-failure-1',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-acknowledged-thread-failure-001',
          );
        },
      },
    ];

    it.each(cases)('$name', async ({ inputs, mock, assert }) => {
      const context = await mock(inputs);
      await assert(context, inputs);
    });
  });

  describe('thread response failures', () => {
    const cases = [
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
          expect(result.completionReceipt?.endpoint).toBe(
            '/webhooks/application/token-thread-failure-3',
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
          expect(result.completionReceipt?.endpoint).toBe(
            '/webhooks/application/token-thread-failure-1',
          );
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
          expect(result.completionReceipt?.endpoint).toBe(
            '/webhooks/application/token-thread-failure-2',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-thread-failure-002',
          );
          expect(await context.store.list('audit')).toContain(
            'interaction-thread-failure-002:audit',
          );
        },
      },
      {
        name: 'reports completion rejection when thread posting returns a rejected receipt',
        inputs: {
          interaction: {
            id: 'interaction-thread-failure-004',
            token: 'token-thread-failure-4',
            actorId: 'user-thread-failure-4',
            channelId: 'channel-thread-failure-4',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-failure-4',
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
              createThreadAndCompletionRejectingResponseTransport(),
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
          expect(result.threadReceipt?.statusCode).toBe(403);
          expect(result.threadPostError).toBe(
            'Discord thread status message returned HTTP 403.',
          );
          expect(result.completionReceipt?.statusCode).toBe(404);
          expect(result.completionPostError).toBe(
            'Discord interaction completion returned HTTP 404.',
          );
          expect(await context.store.list('state')).toContain(
            'interaction-thread-failure-004',
          );
        },
      },
    ];

    it.each(cases)('$name', async ({ inputs, mock, assert }) => {
      const context = await mock(inputs);
      await assert(context, inputs);
    });
  });

  describe('interaction acknowledgement failures', () => {
    const cases = [
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
            'Discord interaction deferred acknowledgement returned HTTP 404.',
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
            'Discord interaction deferred acknowledgement returned HTTP 404.',
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

    it.each(cases)('$name', async ({ inputs, mock, assert }) => {
      const context = await mock();
      await assert(context, inputs);
    });
  });

  describe('route failures', () => {
    const cases = [
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
          expect(result.responsePayload?.content).toContain(
            'Reason: project/thread context mismatch: expected=thread-7 detected=thread-6,thread-7. Recovery: /open-project --repo <repo_name> --project <project_name> --intent maintenance|bugfix|new-feature',
          );
          expect(await context.store.list('state')).not.toContain(
            'interaction-002',
          );
          expect(await context.store.list('audit')).toContain(
            'interaction-002:audit',
          );
          const auditRecord = await context.store.read(
            'audit',
            'interaction-002:audit',
          );
          expect(auditRecord.ok).toBe(true);
          if (auditRecord.ok) {
            expect(auditRecord.value).toMatchObject({
              payload: {
                reason:
                  'project/thread context mismatch: expected=thread-7 detected=thread-6,thread-7. Recovery: /open-project --repo <repo_name> --project <project_name> --intent maintenance|bugfix|new-feature',
              },
            });
          }
        },
      },
      {
        name: 'fails closed with explicit role-denied route reason',
        inputs: {
          interaction: {
            id: 'interaction-route-permission-denied-001',
            token: 'token-route-permission-denied-1',
            actorId: 'user-route-permission-denied-1',
            channelId: 'thread-route-permission-denied-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'new-project',
            boundThreadId: 'thread-route-permission-denied-1',
            projectRepo: 'devplat',
            projectName: 'alpha',
            actorRoleIds: ['role-spec-approver'],
            projectOperatorRoleId: 'role-project-operator',
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
          inputs: {
            interaction: DiscordOperatorInteraction;
          },
        ) => {
          const result = await context.service.handleInteraction(
            inputs.interaction,
          );

          expect(result.allowed).toBe(false);
          expect(result.failedClosed).toBe(true);
          expect(result.responsePayload?.content).toContain(
            'Reason: permission denied: caller=user-route-permission-denied-1 action=new-project requiredRole=project-operator context=thread:thread-route-permission-denied-1',
          );
          const auditRecord = await context.store.read(
            'audit',
            'interaction-route-permission-denied-001:audit',
          );
          expect(auditRecord.ok).toBe(true);
          if (auditRecord.ok) {
            expect(auditRecord.value).toMatchObject({
              payload: {
                reason:
                  'permission denied: caller=user-route-permission-denied-1 action=new-project requiredRole=project-operator context=thread:thread-route-permission-denied-1',
              },
            });
          }
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
                reason:
                  'Discord interaction acknowledgement returned HTTP 404.',
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

    it.each(cases)('$name', async ({ inputs, mock, assert }) => {
      const context = await mock();
      await assert(context, inputs);
    });
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
          const methods: string[] = [];
          const fetchImpl = async (
            url: string,
            init?: RequestInit,
          ): Promise<Response> => {
            calls.push(url);
            bodies.push(String(init?.body ?? ''));
            methods.push(String(init?.method ?? ''));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          };
          return {
            bodies,
            calls,
            methods,
            transport: new DiscordRestResponseTransport(
              'bot-token',
              'https://discord.test/api/v10',
              fetchImpl,
              'application-7',
            ),
          };
        },
        assert: async (
          context: {
            bodies: string[];
            calls: string[];
            methods: string[];
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
          const deferredReceipt =
            await context.transport.postInteractionDeferred(inputs.interaction);
          const completionReceipt =
            await context.transport.postInteractionCompletion(
              inputs.interaction,
              {
                allowed_mentions: { parse: [] },
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
                content: 'completed',
                flags: 64,
              },
            );

          expect(interactionReceipt.endpoint).toBe(
            '/interactions/interaction-003/token-3/callback',
          );
          expect(threadReceipt.endpoint).toBe('/channels/thread-7/messages');
          expect(deferredReceipt.endpoint).toBe(
            '/interactions/interaction-003/token-3/callback',
          );
          expect(completionReceipt.endpoint).toBe(
            '/webhooks/application-7/token-3',
          );
          expect(context.calls).toEqual([
            'https://discord.test/api/v10/interactions/interaction-003/token-3/callback',
            'https://discord.test/api/v10/channels/thread-7/messages',
            'https://discord.test/api/v10/interactions/interaction-003/token-3/callback',
            'https://discord.test/api/v10/webhooks/application-7/token-3',
          ]);
          expect(context.methods).toEqual(['POST', 'POST', 'POST', 'POST']);
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
            JSON.stringify({
              type: 5,
              data: {
                flags: 64,
              },
            }),
            JSON.stringify({
              content: 'completed',
              allowed_mentions: { parse: [] },
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
              flags: 64,
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
          const completionReceipt = await transport.postInteractionCompletion(
            inputs.interaction,
            createMessagePayload('Completed.'),
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
          expect(completionReceipt).toMatchObject({
            endpoint: '/webhooks/loopback/token-6',
            responseBody: {
              content: 'Completed.',
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
      {
        name: 'requires an application id before completing deferred interactions',
        inputs: {
          interaction: {
            id: 'interaction-application-1',
            token: 'token-application-1',
            actorId: 'user-application-1',
            channelId: 'channel-application-1',
            updatedAt: '2026-04-04T00:00:00.000Z',
            commandName: 'show status',
            threadId: 'thread-application-1',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () =>
          new DiscordRestResponseTransport(
            'bot-token',
            'https://discord.test/api/v10',
          ),
        assert: async (
          transport: DiscordRestResponseTransport,
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          await expect(
            transport.postInteractionCompletion(
              inputs.interaction,
              createMessagePayload('completed'),
            ),
          ).rejects.toThrow('DISCORD_APPLICATION_ID');
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
          const methods: string[] = [];
          const fetchImpl = async (
            url: DiscordFetchUrl,
            init?: RequestInit,
          ): Promise<Response> => {
            calls.push(String(url));
            methods.push(String(init?.method ?? ''));
            return new Response('not-json', { status: 202 });
          };
          return {
            calls,
            methods,
            transport: new DiscordRestResponseTransport(
              '',
              'https://discord.test',
              fetchImpl,
              'application-rest',
            ),
          };
        },
        assert: async (
          context: {
            calls: string[];
            methods: string[];
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
          const completionReceipt =
            await context.transport.postInteractionCompletion(
              inputs.interaction,
              createMessagePayload('Completed.'),
            );

          expect(receipt.statusCode).toBe(202);
          expect(deferredReceipt.statusCode).toBe(202);
          expect(completionReceipt.statusCode).toBe(202);
          expect(receipt.responseBody).toBeNull();
          expect(receipt.endpoint).toBe(
            '/interactions/interaction%2Frest%201/token%2Frest%201/callback',
          );
          expect(completionReceipt.endpoint).toBe(
            '/webhooks/application-rest/token%2Frest%201',
          );
          expect(context.calls).toEqual([
            'https://discord.test/interactions/interaction%2Frest%201/token%2Frest%201/callback',
            'https://discord.test/interactions/interaction%2Frest%201/token%2Frest%201/callback',
            'https://discord.test/webhooks/application-rest/token%2Frest%201',
          ]);
          expect(context.methods).toEqual(['POST', 'POST', 'POST']);
          await expect(
            context.transport.postThreadMessage(
              'thread-rest',
              createMessagePayload('Accepted.'),
            ),
          ).rejects.toThrow('DISCORD_BOT_TOKEN');
        },
      },
      {
        name: 'uses deferred update acknowledgements for component callbacks',
        inputs: {
          interaction: {
            id: 'interaction/rest component',
            token: 'token/rest component',
            actorId: 'user-rest-component',
            channelId: 'channel-rest-component',
            updatedAt: '2026-04-04T00:00:00.000Z',
            customId: 'devplat:v1:show-status:thread-rest-component',
            threadId: 'thread-rest-component',
          } satisfies DiscordOperatorInteraction,
        },
        mock: () => {
          const bodies: string[] = [];
          const fetchImpl = async (
            _url: DiscordFetchUrl,
            init?: RequestInit,
          ): Promise<Response> => {
            bodies.push(String(init?.body ?? ''));
            return new Response('not-json', { status: 202 });
          };
          return {
            bodies,
            transport: new DiscordRestResponseTransport(
              'bot-token',
              'https://discord.test',
              fetchImpl,
              'application-rest',
            ),
          };
        },
        assert: async (
          context: {
            bodies: string[];
            transport: DiscordRestResponseTransport;
          },
          inputs: { interaction: DiscordOperatorInteraction },
        ) => {
          const deferredReceipt =
            await context.transport.postInteractionDeferred(inputs.interaction);

          expect(deferredReceipt.statusCode).toBe(202);
          expect(context.bodies).toEqual([
            JSON.stringify({
              type: 6,
            }),
          ]);
        },
      },
      {
        name: 'posts encoded thread messages with bot tokens',
        inputs: {
          threadId: 'thread/rest 2',
        },
        mock: () => {
          const calls: string[] = [];
          const fetchImpl = async (url: DiscordFetchUrl): Promise<Response> => {
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
