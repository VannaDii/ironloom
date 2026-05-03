import { ApprovalRecordArtifactService } from '@vannadii/devplat-artifacts';
import { ARTIFACT_TYPE_APPROVAL_RECORD } from '@vannadii/devplat-core';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createDiscordApprovalRequest,
  describeDiscordApprovalRequest,
  mapAllowedPolicyToApprovalDecision,
  mapApprovalActionToSubjectType,
  mapApprovalActionToPolicyAction,
} from './logic.js';
import type { DiscordApprovalRequest, DiscordApprovalResult } from './codec.js';

export class DiscordInteractiveApprovalService {
  public constructor(
    private readonly policy = new DecisionPolicyService(),
    private readonly artifacts = new ApprovalRecordArtifactService(),
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
      artifactType: ARTIFACT_TYPE_APPROVAL_RECORD,
      version: 1,
      summary: request.summary,
      status: decision.allowed ? 'approved' : 'review',
      trace: [...request.trace, ...decision.trace],
      updatedAt: request.updatedAt,
      payload: {
        actorId: request.actorId,
        approvalId: request.id,
        decision: mapAllowedPolicyToApprovalDecision(decision.allowed),
        rationale: decision.auditReason ?? decision.reason,
        subjectId: request.artifactId,
        subjectType: mapApprovalActionToSubjectType(request.action),
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
