import { ArtifactEnvelopeService } from '@vannadii/devplat-artifacts';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordApprovalRequest,
  describeDiscordApprovalRequest,
  mapApprovalActionToPolicyAction,
} from './logic.js';
import type { DiscordApprovalRequest, DiscordApprovalResult } from './codec.js';

export class DiscordInteractiveApprovalService {
  public constructor(
    private readonly policy = new DecisionPolicyService(),
    private readonly artifacts = new ArtifactEnvelopeService(),
    private readonly telemetry = new TelemetryEventService(),
    private readonly store = new FileStoreService(),
  ) {}

  public execute(input: DiscordApprovalRequest): DiscordApprovalRequest {
    return createDiscordApprovalRequest(input);
  }

  public explain(input: DiscordApprovalRequest): string {
    return describeDiscordApprovalRequest(input);
  }

  public async handleApproval(
    input: DiscordApprovalRequest,
  ): Promise<DiscordApprovalResult> {
    const request = this.execute(input);
    const policyAction = mapApprovalActionToPolicyAction(request.action);
    const decision = this.policy.evaluateControlAction(
      policyAction,
      request.privileged,
    );
    const artifact = this.artifacts.execute({
      id: `${request.id}:artifact`,
      artifactType: 'discord-approval',
      version: 1,
      summary: request.summary,
      status: decision.allowed ? 'approved' : 'review',
      trace: [...request.trace, ...decision.trace],
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        channelId: request.channelId,
        action: request.action,
        actorId: request.actorId,
        requestedArtifactId: request.artifactId,
        policyDecisionId: decision.id,
        allowed: decision.allowed,
      },
    });

    await this.store.store({
      id: request.id,
      key: request.id,
      scope: 'state',
      summary: request.summary,
      status: artifact.status,
      trace: artifact.trace,
      updatedAt: request.updatedAt,
      payload: {
        threadId: request.threadId,
        channelId: request.channelId,
        action: request.action,
        policyDecisionId: decision.id,
        artifactId: artifact.id,
      },
    });

    await this.store.store({
      id: artifact.id,
      key: artifact.id,
      scope: 'artifacts',
      summary: artifact.summary,
      status: artifact.status,
      trace: artifact.trace,
      updatedAt: artifact.updatedAt,
      payload: artifact,
    });

    await this.telemetry.record({
      id: `telemetry-${request.id}`,
      summary: `Discord ${request.action} approval in ${request.threadId}`,
      status: artifact.status,
      trace: artifact.trace,
      updatedAt: request.updatedAt,
      actorId: request.actorId,
      action: `approval-${request.action}`,
      scope: 'discord',
      details: {
        threadId: request.threadId,
        channelId: request.channelId,
        policyDecisionId: decision.id,
        artifactId: artifact.id,
        allowed: decision.allowed,
      },
    });

    return {
      request,
      policyDecisionId: decision.id,
      allowed: decision.allowed,
      artifactId: artifact.id,
      persistedKey: request.id,
    };
  }
}
