import * as t from 'io-ts';

import {
  ApprovalRecordArtifactCodec,
  ArtifactEnvelopeCodec,
  AuditLogArtifactCodec,
  MergeDecisionArtifactCodec,
  RebaseResultArtifactCodec,
} from '@vannadii/devplat-artifacts';
import {
  DiscordApprovalRequestCodec,
  DiscordChannelBindingCodec,
  DiscordControlRequestCodec,
  DiscordThreadSessionCodec,
} from '@vannadii/devplat-discord';
import { ExecuteRebaseDependentsInputCodec } from '@vannadii/devplat-branching';
import { GitHubActionRequestCodec } from '@vannadii/devplat-github';
import { MemoryEntryCodec } from '@vannadii/devplat-memory';
import { TelemetryEventCodec } from '@vannadii/devplat-observability';
import { ResearchBriefCodec } from '@vannadii/devplat-research';
import { ReviewFindingCodec } from '@vannadii/devplat-review';
import { SlicePlanCodec } from '@vannadii/devplat-slicing';
import { DevplatConfigCodec } from '@vannadii/devplat-config';
import { SonarBootstrapVerificationInputCodec } from '@vannadii/devplat-sonarcloud';
import { SpecRecordCodec } from '@vannadii/devplat-specs';
import { PullRequestRecordCodec } from '@vannadii/devplat-prs';
import { TaskRecordCodec } from '@vannadii/devplat-queue';
import { StoredRecordCodec, StoreScopeCodec } from '@vannadii/devplat-storage';
import {
  WorktreeAllocationCodec,
  WorktreeReleaseModeCodec,
  WorktreeSyncModeCodec,
} from '@vannadii/devplat-worktrees';

import type {
  ApproveSpecRecordToolInput,
  AllocateWorktreeToolInput,
  BindDiscordThreadToolInput,
  ClaimTaskToolInput,
  CreateApprovalRecordToolInput,
  CreateRemediationPlanToolInput,
  CreateResearchBriefToolInput,
  CreateReviewFindingToolInput,
  CreateSlicePlanToolInput,
  CreateArtifactEnvelopeToolInput,
  CreateAuditLogToolInput,
  CreateGitHubActionRequestToolInput,
  CreateMergeDecisionToolInput,
  CreateOpenClawPluginConfigToolInput,
  CreatePullRequestRecordToolInput,
  CreateRebaseResultToolInput,
  CreateTaskRecordToolInput,
  CreateSpecRecordToolInput,
  ExecuteRebaseDependentsToolInput,
  EvaluateSlicePlanReadinessToolInput,
  ExecuteCommandToolInput,
  EvaluateSonarQualityGateToolInput,
  EvaluatePolicyActionToolInput,
  HandleDiscordApprovalToolInput,
  HandleDiscordControlToolInput,
  ListStoredRecordsToolInput,
  OpenDiscordThreadToolInput,
  PlanRebaseDependentsToolInput,
  ReadStoredRecordToolInput,
  RecordTelemetryEventToolInput,
  ReleaseWorktreeToolInput,
  RememberMemoryEntryToolInput,
  ResolveRuntimeConfigToolInput,
  RunGatesToolInput,
  RunSupervisorStepToolInput,
  SubmitPullRequestMergeToolInput,
  StoreRecordToolInput,
  SubmitGitHubActionToolInput,
  SubmitPullRequestUpdateToolInput,
  SyncWorktreeToolInput,
  UpdateTaskToolInput,
  UpdateSpecRecordToolInput,
  ValidateArtifactToolInput,
  VerifySonarBootstrapToolInput,
} from './types.js';

export const RunGatesToolInputCodec: t.Type<RunGatesToolInput> = t.type({
  gateNames: t.array(t.string),
  summary: t.string,
});

export const CreateResearchBriefToolInputCodec: t.Type<CreateResearchBriefToolInput> =
  ResearchBriefCodec;

export const CreateSpecRecordToolInputCodec: t.Type<CreateSpecRecordToolInput> =
  SpecRecordCodec;

export const ApproveSpecRecordToolInputCodec: t.Type<ApproveSpecRecordToolInput> =
  SpecRecordCodec;

export const UpdateSpecRecordToolInputCodec: t.Type<UpdateSpecRecordToolInput> =
  SpecRecordCodec;

export const CreateSlicePlanToolInputCodec: t.Type<CreateSlicePlanToolInput> =
  SlicePlanCodec;

export const EvaluateSlicePlanReadinessToolInputCodec: t.Type<EvaluateSlicePlanReadinessToolInput> =
  t.type({
    plan: SlicePlanCodec,
    completedSliceIds: t.array(t.string),
  });

export const ResolveRuntimeConfigToolInputCodec: t.Type<ResolveRuntimeConfigToolInput> =
  t.type({
    env: t.record(t.string, t.string),
  });

export const CreateOpenClawPluginConfigToolInputCodec: t.Type<CreateOpenClawPluginConfigToolInput> =
  DevplatConfigCodec;

export const CreateArtifactEnvelopeToolInputCodec: t.Type<CreateArtifactEnvelopeToolInput> =
  ArtifactEnvelopeCodec;

export const CreateApprovalRecordToolInputCodec: t.Type<CreateApprovalRecordToolInput> =
  ApprovalRecordArtifactCodec;

export const CreateAuditLogToolInputCodec: t.Type<CreateAuditLogToolInput> =
  AuditLogArtifactCodec;

export const CreateMergeDecisionToolInputCodec: t.Type<CreateMergeDecisionToolInput> =
  MergeDecisionArtifactCodec;

export const CreateRebaseResultToolInputCodec: t.Type<CreateRebaseResultToolInput> =
  RebaseResultArtifactCodec;

export const ExecuteCommandToolInputCodec: t.Type<ExecuteCommandToolInput> =
  t.intersection([
    t.type({
      command: t.string,
      args: t.array(t.string),
      actorId: t.string,
      privileged: t.boolean,
    }),
    t.partial({
      cwd: t.string,
      env: t.record(t.string, t.string),
      timeoutMs: t.number,
    }),
  ]);

export const AllocateWorktreeToolInputCodec: t.Type<AllocateWorktreeToolInput> =
  t.type({
    taskId: t.string,
    branchName: t.string,
  });

export const SyncWorktreeToolInputCodec: t.Type<SyncWorktreeToolInput> =
  t.intersection([
    t.type({
      allocation: WorktreeAllocationCodec,
      baseBranch: t.string,
    }),
    t.partial({
      syncMode: WorktreeSyncModeCodec,
    }),
  ]);

export const ReleaseWorktreeToolInputCodec: t.Type<ReleaseWorktreeToolInput> =
  t.intersection([
    t.type({
      allocation: WorktreeAllocationCodec,
    }),
    t.partial({
      releaseMode: WorktreeReleaseModeCodec,
    }),
  ]);

export const BindDiscordThreadToolInputCodec: t.Type<BindDiscordThreadToolInput> =
  t.intersection([
    DiscordChannelBindingCodec,
    t.type({
      threadId: t.string,
      parentChannelId: t.string,
      actorId: t.string,
    }),
  ]);

export const OpenDiscordThreadToolInputCodec: t.Type<OpenDiscordThreadToolInput> =
  t.intersection([
    DiscordThreadSessionCodec,
    t.type({
      actorId: t.string,
    }),
  ]);

export const HandleDiscordApprovalToolInputCodec: t.Type<HandleDiscordApprovalToolInput> =
  DiscordApprovalRequestCodec;

export const HandleDiscordControlToolInputCodec: t.Type<HandleDiscordControlToolInput> =
  DiscordControlRequestCodec;

export const VerifySonarBootstrapToolInputCodec: t.Type<VerifySonarBootstrapToolInput> =
  SonarBootstrapVerificationInputCodec;

export const EvaluateSonarQualityGateToolInputCodec: t.Type<EvaluateSonarQualityGateToolInput> =
  t.type({
    projectKey: t.string,
    overallCoverage: t.number,
    newCodeCoverage: t.number,
    blockingIssues: t.number,
  });

export const CreateReviewFindingToolInputCodec: t.Type<CreateReviewFindingToolInput> =
  ReviewFindingCodec;

export const CreateRemediationPlanToolInputCodec: t.Type<CreateRemediationPlanToolInput> =
  t.type({
    findings: t.array(ReviewFindingCodec),
    autofix: t.boolean,
  });

export const RememberMemoryEntryToolInputCodec: t.Type<RememberMemoryEntryToolInput> =
  MemoryEntryCodec;

export const EvaluatePolicyActionToolInputCodec: t.Type<EvaluatePolicyActionToolInput> =
  t.type({
    action: t.string,
    privileged: t.boolean,
  });

export const RecordTelemetryEventToolInputCodec: t.Type<RecordTelemetryEventToolInput> =
  TelemetryEventCodec;

export const CreateTaskRecordToolInputCodec: t.Type<CreateTaskRecordToolInput> =
  TaskRecordCodec;

export const ReadStoredRecordToolInputCodec: t.Type<ReadStoredRecordToolInput> =
  t.type({
    scope: StoreScopeCodec,
    key: t.string,
  });

export const ListStoredRecordsToolInputCodec: t.Type<ListStoredRecordsToolInput> =
  t.type({
    scope: StoreScopeCodec,
  });

export const StoreRecordToolInputCodec: t.Type<StoreRecordToolInput> = t.type({
  record: StoredRecordCodec,
  actorId: t.string,
  privileged: t.boolean,
});

export const CreatePullRequestRecordToolInputCodec: t.Type<CreatePullRequestRecordToolInput> =
  PullRequestRecordCodec;

export const SubmitPullRequestUpdateToolInputCodec: t.Type<SubmitPullRequestUpdateToolInput> =
  t.type({
    record: PullRequestRecordCodec,
    actorId: t.string,
  });

export const SubmitPullRequestMergeToolInputCodec: t.Type<SubmitPullRequestMergeToolInput> =
  t.type({
    record: PullRequestRecordCodec,
    actorId: t.string,
  });

export const PlanRebaseDependentsToolInputCodec: t.Type<PlanRebaseDependentsToolInput> =
  t.type({
    record: PullRequestRecordCodec,
    dependentBranches: t.array(t.string),
  });

export const ExecuteRebaseDependentsToolInputCodec: t.Type<ExecuteRebaseDependentsToolInput> =
  ExecuteRebaseDependentsInputCodec;

export const SubmitGitHubActionToolInputCodec: t.Type<SubmitGitHubActionToolInput> =
  t.type({
    request: GitHubActionRequestCodec,
    actorId: t.string,
  });

export const CreateGitHubActionRequestToolInputCodec: t.Type<CreateGitHubActionRequestToolInput> =
  GitHubActionRequestCodec;

export const ClaimTaskToolInputCodec: t.Type<ClaimTaskToolInput> = t.type({
  taskId: t.string,
  sliceId: t.string,
  threadId: t.string,
  assigneeId: t.string,
});

export const UpdateTaskToolInputCodec: t.Type<UpdateTaskToolInput> = t.type({
  taskId: t.string,
  sliceId: t.string,
  threadId: t.string,
  status: t.union([
    t.literal('review'),
    t.literal('blocked'),
    t.literal('approved'),
    t.literal('merge-ready'),
    t.literal('merged'),
    t.literal('failed'),
    t.literal('rebasing'),
    t.literal('complete'),
  ]),
});

export const ValidateArtifactToolInputCodec: t.Type<ValidateArtifactToolInput> =
  t.type({
    artifact: t.UnknownRecord,
  });

export const RunSupervisorStepToolInputCodec: t.Type<RunSupervisorStepToolInput> =
  t.type({
    action: t.string,
    actorId: t.string,
    privileged: t.boolean,
  });
