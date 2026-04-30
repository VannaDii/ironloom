import type * as t from 'io-ts';

import type {
  AllocateWorktreeToolInputCodec,
  ApproveSpecRecordToolInputCodec,
  BindDiscordThreadToolInputCodec,
  ClaimTaskToolInputCodec,
  CreateApprovalRecordToolInputCodec,
  CreateArtifactEnvelopeToolInputCodec,
  CreateAuditLogToolInputCodec,
  CreateGitHubActionRequestToolInputCodec,
  CreateMergeDecisionToolInputCodec,
  CreateOpenClawPluginConfigToolInputCodec,
  CreatePullRequestRecordToolInputCodec,
  CreateRebaseResultToolInputCodec,
  CreateRemediationPlanToolInputCodec,
  CreateResearchBriefToolInputCodec,
  CreateReviewFindingToolInputCodec,
  CreateSlicePlanToolInputCodec,
  CreateSpecRecordToolInputCodec,
  CreateTaskRecordToolInputCodec,
  EvaluatePolicyActionToolInputCodec,
  EvaluateSlicePlanReadinessToolInputCodec,
  EvaluateSonarQualityGateToolInputCodec,
  ExecuteCommandToolInputCodec,
  ExecuteRebaseDependentsToolInputCodec,
  HandleDiscordApprovalToolInputCodec,
  HandleDiscordControlToolInputCodec,
  ListStoredRecordsToolInputCodec,
  OpenDiscordThreadToolInputCodec,
  PlanRebaseDependentsToolInputCodec,
  ReadStoredRecordToolInputCodec,
  RecordTelemetryEventToolInputCodec,
  ReleaseWorktreeToolInputCodec,
  RememberMemoryEntryToolInputCodec,
  ResolveRuntimeConfigToolInputCodec,
  RunGatesToolInputCodec,
  RunSupervisorStepToolInputCodec,
  StoreRecordToolInputCodec,
  StoreRecordToolRecordCodec,
  SubmitGitHubActionToolInputCodec,
  SubmitPullRequestMergeToolInputCodec,
  SubmitPullRequestUpdateToolInputCodec,
  SyncWorktreeToolInputCodec,
  UpdateSpecRecordToolInputCodec,
  UpdateTaskStatusCodec,
  UpdateTaskToolInputCodec,
  ValidateArtifactToolInputCodec,
  VerifySonarBootstrapToolInputCodec,
} from './codec.js';

export type RunGatesToolInput = t.TypeOf<typeof RunGatesToolInputCodec>;

export type CreateResearchBriefToolInput = t.TypeOf<
  typeof CreateResearchBriefToolInputCodec
>;

export type CreateSpecRecordToolInput = t.TypeOf<
  typeof CreateSpecRecordToolInputCodec
>;

export type ApproveSpecRecordToolInput = t.TypeOf<
  typeof ApproveSpecRecordToolInputCodec
>;

export type UpdateSpecRecordToolInput = t.TypeOf<
  typeof UpdateSpecRecordToolInputCodec
>;

export type CreateSlicePlanToolInput = t.TypeOf<
  typeof CreateSlicePlanToolInputCodec
>;

export type EvaluateSlicePlanReadinessToolInput = t.TypeOf<
  typeof EvaluateSlicePlanReadinessToolInputCodec
>;

export type ResolveRuntimeConfigToolInput = t.TypeOf<
  typeof ResolveRuntimeConfigToolInputCodec
>;

export type CreateOpenClawPluginConfigToolInput = t.TypeOf<
  typeof CreateOpenClawPluginConfigToolInputCodec
>;

export type CreateArtifactEnvelopeToolInput = t.TypeOf<
  typeof CreateArtifactEnvelopeToolInputCodec
>;

export type CreateApprovalRecordToolInput = t.TypeOf<
  typeof CreateApprovalRecordToolInputCodec
>;

export type CreateAuditLogToolInput = t.TypeOf<
  typeof CreateAuditLogToolInputCodec
>;

export type CreateMergeDecisionToolInput = t.TypeOf<
  typeof CreateMergeDecisionToolInputCodec
>;

export type CreateRebaseResultToolInput = t.TypeOf<
  typeof CreateRebaseResultToolInputCodec
>;

export type AllocateWorktreeToolInput = t.TypeOf<
  typeof AllocateWorktreeToolInputCodec
>;

export type SyncWorktreeToolInput = t.TypeOf<typeof SyncWorktreeToolInputCodec>;

export type ReleaseWorktreeToolInput = t.TypeOf<
  typeof ReleaseWorktreeToolInputCodec
>;

export type BindDiscordThreadToolInput = t.TypeOf<
  typeof BindDiscordThreadToolInputCodec
>;

export type OpenDiscordThreadToolInput = t.TypeOf<
  typeof OpenDiscordThreadToolInputCodec
>;

export type HandleDiscordApprovalToolInput = t.TypeOf<
  typeof HandleDiscordApprovalToolInputCodec
>;

export type HandleDiscordControlToolInput = t.TypeOf<
  typeof HandleDiscordControlToolInputCodec
>;

export type VerifySonarBootstrapToolInput = t.TypeOf<
  typeof VerifySonarBootstrapToolInputCodec
>;

export type EvaluateSonarQualityGateToolInput = t.TypeOf<
  typeof EvaluateSonarQualityGateToolInputCodec
>;

export type CreateReviewFindingToolInput = t.TypeOf<
  typeof CreateReviewFindingToolInputCodec
>;

export type CreateRemediationPlanToolInput = t.TypeOf<
  typeof CreateRemediationPlanToolInputCodec
>;

export type ExecuteCommandToolInput = t.TypeOf<
  typeof ExecuteCommandToolInputCodec
>;

export type RememberMemoryEntryToolInput = t.TypeOf<
  typeof RememberMemoryEntryToolInputCodec
>;

export type EvaluatePolicyActionToolInput = t.TypeOf<
  typeof EvaluatePolicyActionToolInputCodec
>;

export type RecordTelemetryEventToolInput = t.TypeOf<
  typeof RecordTelemetryEventToolInputCodec
>;

export type CreateTaskRecordToolInput = t.TypeOf<
  typeof CreateTaskRecordToolInputCodec
>;

export type ReadStoredRecordToolInput = t.TypeOf<
  typeof ReadStoredRecordToolInputCodec
>;

export type ListStoredRecordsToolInput = t.TypeOf<
  typeof ListStoredRecordsToolInputCodec
>;

export type StoreRecordToolRecord = t.TypeOf<typeof StoreRecordToolRecordCodec>;

export type StoreRecordToolInput = t.TypeOf<typeof StoreRecordToolInputCodec>;

export type CreatePullRequestRecordToolInput = t.TypeOf<
  typeof CreatePullRequestRecordToolInputCodec
>;

export type SubmitPullRequestUpdateToolInput = t.TypeOf<
  typeof SubmitPullRequestUpdateToolInputCodec
>;

export type SubmitPullRequestMergeToolInput = t.TypeOf<
  typeof SubmitPullRequestMergeToolInputCodec
>;

export type PlanRebaseDependentsToolInput = t.TypeOf<
  typeof PlanRebaseDependentsToolInputCodec
>;

export type ExecuteRebaseDependentsToolInput = t.TypeOf<
  typeof ExecuteRebaseDependentsToolInputCodec
>;

export type SubmitGitHubActionToolInput = t.TypeOf<
  typeof SubmitGitHubActionToolInputCodec
>;

export type CreateGitHubActionRequestToolInput = t.TypeOf<
  typeof CreateGitHubActionRequestToolInputCodec
>;

export type ClaimTaskToolInput = t.TypeOf<typeof ClaimTaskToolInputCodec>;

export type UpdateTaskStatus = t.TypeOf<typeof UpdateTaskStatusCodec>;

export type UpdateTaskToolInput = t.TypeOf<typeof UpdateTaskToolInputCodec>;

export type ValidateArtifactToolInput = t.TypeOf<
  typeof ValidateArtifactToolInputCodec
>;

export type RunSupervisorStepToolInput = t.TypeOf<
  typeof RunSupervisorStepToolInputCodec
>;
