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
  DiscordOperatorInteractionCodec,
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
import { SupervisorLifecycleSignalCodec } from '@vannadii/devplat-supervisor';
import { PullRequestRecordCodec } from '@vannadii/devplat-prs';
import { TaskRecordCodec } from '@vannadii/devplat-queue';
import {
  StoredRecordCodec,
  StoreIndexNameCodec,
  StoreScopeCodec,
} from '@vannadii/devplat-storage';
import {
  WorktreeAllocationCodec,
  WorktreeReleaseModeCodec,
  WorktreeSyncModeCodec,
} from '@vannadii/devplat-worktrees';

export const RunGatesToolInputCodec = t.type({
  gateNames: t.array(t.string),
  summary: t.string,
});

export const CreateResearchBriefToolInputCodec = ResearchBriefCodec;

export const CreateSpecRecordToolInputCodec = SpecRecordCodec;

export const ApproveSpecRecordToolInputCodec = SpecRecordCodec;

export const UpdateSpecRecordToolInputCodec = SpecRecordCodec;

export const CreateSlicePlanToolInputCodec = SlicePlanCodec;

export const EvaluateSlicePlanReadinessToolInputCodec = t.type({
  plan: SlicePlanCodec,
  completedSliceIds: t.array(t.string),
});

export const ResolveRuntimeConfigToolInputCodec = t.type({
  env: t.record(t.string, t.string),
});

export const CreateOpenClawPluginConfigToolInputCodec = DevplatConfigCodec;

export const CreateArtifactEnvelopeToolInputCodec = ArtifactEnvelopeCodec;

export const CreateApprovalRecordToolInputCodec = ApprovalRecordArtifactCodec;

export const CreateAuditLogToolInputCodec = AuditLogArtifactCodec;

export const CreateMergeDecisionToolInputCodec = MergeDecisionArtifactCodec;

export const CreateRebaseResultToolInputCodec = RebaseResultArtifactCodec;

export const ExecuteCommandToolInputCodec = t.intersection([
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

export const AllocateWorktreeToolInputCodec = t.type({
  taskId: t.string,
  branchName: t.string,
});

export const SyncWorktreeToolInputCodec = t.intersection([
  t.type({
    allocation: WorktreeAllocationCodec,
    baseBranch: t.string,
  }),
  t.partial({
    syncMode: WorktreeSyncModeCodec,
  }),
]);

export const ReleaseWorktreeToolInputCodec = t.intersection([
  t.type({
    allocation: WorktreeAllocationCodec,
  }),
  t.partial({
    releaseMode: WorktreeReleaseModeCodec,
  }),
]);

export const BindDiscordThreadToolInputCodec = t.intersection([
  DiscordChannelBindingCodec,
  t.type({
    threadId: t.string,
    parentChannelId: t.string,
    actorId: t.string,
  }),
]);

export const OpenDiscordThreadToolInputCodec = t.intersection([
  DiscordThreadSessionCodec,
  t.type({
    actorId: t.string,
  }),
]);

export const HandleDiscordApprovalToolInputCodec = DiscordApprovalRequestCodec;

export const HandleDiscordControlToolInputCodec = t.union([
  DiscordControlRequestCodec,
  DiscordOperatorInteractionCodec,
]);

export const VerifySonarBootstrapToolInputCodec =
  SonarBootstrapVerificationInputCodec;

export const EvaluateSonarQualityGateToolInputCodec = t.type({
  projectKey: t.string,
  overallCoverage: t.number,
  newCodeCoverage: t.number,
  blockingIssues: t.number,
});

export const CreateReviewFindingToolInputCodec = ReviewFindingCodec;

export const CreateRemediationPlanToolInputCodec = t.type({
  findings: t.array(ReviewFindingCodec),
  autofix: t.boolean,
});

export const RememberMemoryEntryToolInputCodec = MemoryEntryCodec;

export const EvaluatePolicyActionToolInputCodec = t.type({
  action: t.string,
  privileged: t.boolean,
});

export const RecordTelemetryEventToolInputCodec = TelemetryEventCodec;

export const CreateTaskRecordToolInputCodec = TaskRecordCodec;

export const ReadStoredRecordToolInputCodec = t.type({
  scope: StoreScopeCodec,
  key: t.string,
});

export const ListStoredRecordsToolInputCodec = t.type({
  scope: StoreScopeCodec,
});

/** Input codec for reading a storage secondary index entry. */
export const ReadStoredIndexToolInputCodec = t.type({
  indexName: StoreIndexNameCodec,
  key: t.string,
});

/** Input codec for listing storage secondary index keys. */
export const ListStoredIndexToolInputCodec = t.type({
  indexName: StoreIndexNameCodec,
});

export const StoreRecordToolRecordCodec = StoredRecordCodec;

export const StoreRecordToolInputCodec = t.type({
  record: StoreRecordToolRecordCodec,
  actorId: t.string,
  privileged: t.boolean,
});

export const CreatePullRequestRecordToolInputCodec = PullRequestRecordCodec;

export const SubmitPullRequestUpdateToolInputCodec = t.type({
  record: PullRequestRecordCodec,
  actorId: t.string,
});

export const SubmitPullRequestMergeToolInputCodec = t.type({
  record: PullRequestRecordCodec,
  actorId: t.string,
});

export const PlanRebaseDependentsToolInputCodec = t.type({
  record: PullRequestRecordCodec,
  dependentBranches: t.array(t.string),
});

export const ExecuteRebaseDependentsToolInputCodec =
  ExecuteRebaseDependentsInputCodec;

export const SubmitGitHubActionToolInputCodec = t.type({
  request: GitHubActionRequestCodec,
  actorId: t.string,
});

export const CreateGitHubActionRequestToolInputCodec = GitHubActionRequestCodec;

export const ClaimTaskToolInputCodec = t.intersection([
  t.type({
    taskId: t.string,
    sliceId: t.string,
    threadId: t.string,
    assigneeId: t.string,
  }),
  t.partial({
    record: TaskRecordCodec,
  }),
]);

export const UpdateTaskStatusCodec = t.union([
  t.literal('review'),
  t.literal('blocked'),
  t.literal('approved'),
  t.literal('merge-ready'),
  t.literal('merged'),
  t.literal('failed'),
  t.literal('rebasing'),
  t.literal('complete'),
]);

export const UpdateTaskToolInputCodec = t.intersection([
  t.type({
    taskId: t.string,
    sliceId: t.string,
    threadId: t.string,
    status: UpdateTaskStatusCodec,
  }),
  t.partial({
    record: TaskRecordCodec,
  }),
]);

export const ValidateArtifactToolInputCodec = t.type({
  artifact: t.UnknownRecord,
});

export const RunSupervisorStepToolInputCodec = t.intersection([
  t.type({
    action: t.string,
    actorId: t.string,
    privileged: t.boolean,
  }),
  t.partial({
    lifecycleSignals: t.array(SupervisorLifecycleSignalCodec),
  }),
]);

/** Input for the run gates OpenClaw tool. */
export type RunGatesToolInput = t.TypeOf<typeof RunGatesToolInputCodec>;

/** Input for the create research brief OpenClaw tool. */
export type CreateResearchBriefToolInput = t.TypeOf<
  typeof CreateResearchBriefToolInputCodec
>;

/** Input for the create spec record OpenClaw tool. */
export type CreateSpecRecordToolInput = t.TypeOf<
  typeof CreateSpecRecordToolInputCodec
>;

/** Input for the approve spec record OpenClaw tool. */
export type ApproveSpecRecordToolInput = t.TypeOf<
  typeof ApproveSpecRecordToolInputCodec
>;

/** Input for the update spec record OpenClaw tool. */
export type UpdateSpecRecordToolInput = t.TypeOf<
  typeof UpdateSpecRecordToolInputCodec
>;

/** Input for the create slice plan OpenClaw tool. */
export type CreateSlicePlanToolInput = t.TypeOf<
  typeof CreateSlicePlanToolInputCodec
>;

/** Input for the evaluate slice plan readiness OpenClaw tool. */
export type EvaluateSlicePlanReadinessToolInput = t.TypeOf<
  typeof EvaluateSlicePlanReadinessToolInputCodec
>;

/** Input for the resolve runtime config OpenClaw tool. */
export type ResolveRuntimeConfigToolInput = t.TypeOf<
  typeof ResolveRuntimeConfigToolInputCodec
>;

/** Input for the create OpenClaw plugin config tool. */
export type CreateOpenClawPluginConfigToolInput = t.TypeOf<
  typeof CreateOpenClawPluginConfigToolInputCodec
>;

/** Input for the create artifact envelope OpenClaw tool. */
export type CreateArtifactEnvelopeToolInput = t.TypeOf<
  typeof CreateArtifactEnvelopeToolInputCodec
>;

/** Input for the create approval record OpenClaw tool. */
export type CreateApprovalRecordToolInput = t.TypeOf<
  typeof CreateApprovalRecordToolInputCodec
>;

/** Input for the create audit log OpenClaw tool. */
export type CreateAuditLogToolInput = t.TypeOf<
  typeof CreateAuditLogToolInputCodec
>;

/** Input for the create merge decision OpenClaw tool. */
export type CreateMergeDecisionToolInput = t.TypeOf<
  typeof CreateMergeDecisionToolInputCodec
>;

/** Input for the create rebase result OpenClaw tool. */
export type CreateRebaseResultToolInput = t.TypeOf<
  typeof CreateRebaseResultToolInputCodec
>;

/** Input for the allocate worktree OpenClaw tool. */
export type AllocateWorktreeToolInput = t.TypeOf<
  typeof AllocateWorktreeToolInputCodec
>;

/** Input for the sync worktree OpenClaw tool. */
export type SyncWorktreeToolInput = t.TypeOf<typeof SyncWorktreeToolInputCodec>;

/** Input for the release worktree OpenClaw tool. */
export type ReleaseWorktreeToolInput = t.TypeOf<
  typeof ReleaseWorktreeToolInputCodec
>;

/** Input for the bind Discord thread OpenClaw tool. */
export type BindDiscordThreadToolInput = t.TypeOf<
  typeof BindDiscordThreadToolInputCodec
>;

/** Input for the open Discord thread OpenClaw tool. */
export type OpenDiscordThreadToolInput = t.TypeOf<
  typeof OpenDiscordThreadToolInputCodec
>;

/** Input for the handle Discord approval OpenClaw tool. */
export type HandleDiscordApprovalToolInput = t.TypeOf<
  typeof HandleDiscordApprovalToolInputCodec
>;

/** Input for the handle Discord control OpenClaw tool. */
export type HandleDiscordControlToolInput = t.TypeOf<
  typeof HandleDiscordControlToolInputCodec
>;

/** Input for the verify Sonar bootstrap OpenClaw tool. */
export type VerifySonarBootstrapToolInput = t.TypeOf<
  typeof VerifySonarBootstrapToolInputCodec
>;

/** Input for the evaluate Sonar quality gate OpenClaw tool. */
export type EvaluateSonarQualityGateToolInput = t.TypeOf<
  typeof EvaluateSonarQualityGateToolInputCodec
>;

/** Input for the create review finding OpenClaw tool. */
export type CreateReviewFindingToolInput = t.TypeOf<
  typeof CreateReviewFindingToolInputCodec
>;

/** Input for the create remediation plan OpenClaw tool. */
export type CreateRemediationPlanToolInput = t.TypeOf<
  typeof CreateRemediationPlanToolInputCodec
>;

/** Input for the execute command OpenClaw tool. */
export type ExecuteCommandToolInput = t.TypeOf<
  typeof ExecuteCommandToolInputCodec
>;

/** Input for the remember memory entry OpenClaw tool. */
export type RememberMemoryEntryToolInput = t.TypeOf<
  typeof RememberMemoryEntryToolInputCodec
>;

/** Input for the evaluate policy action OpenClaw tool. */
export type EvaluatePolicyActionToolInput = t.TypeOf<
  typeof EvaluatePolicyActionToolInputCodec
>;

/** Input for the record telemetry event OpenClaw tool. */
export type RecordTelemetryEventToolInput = t.TypeOf<
  typeof RecordTelemetryEventToolInputCodec
>;

/** Input for the create task record OpenClaw tool. */
export type CreateTaskRecordToolInput = t.TypeOf<
  typeof CreateTaskRecordToolInputCodec
>;

/** Input for the read stored record OpenClaw tool. */
export type ReadStoredRecordToolInput = t.TypeOf<
  typeof ReadStoredRecordToolInputCodec
>;

/** Input for the list stored records OpenClaw tool. */
export type ListStoredRecordsToolInput = t.TypeOf<
  typeof ListStoredRecordsToolInputCodec
>;

/** Input for the read stored index OpenClaw tool. */
export type ReadStoredIndexToolInput = t.TypeOf<
  typeof ReadStoredIndexToolInputCodec
>;

/** Input for the list stored index OpenClaw tool. */
export type ListStoredIndexToolInput = t.TypeOf<
  typeof ListStoredIndexToolInputCodec
>;

/** Stored record passed through the store record OpenClaw tool. */
export type StoreRecordToolRecord = t.TypeOf<typeof StoreRecordToolRecordCodec>;

/** Input for the store record OpenClaw tool. */
export type StoreRecordToolInput = t.TypeOf<typeof StoreRecordToolInputCodec>;

/** Input for the create pull request record OpenClaw tool. */
export type CreatePullRequestRecordToolInput = t.TypeOf<
  typeof CreatePullRequestRecordToolInputCodec
>;

/** Input for the submit pull request update OpenClaw tool. */
export type SubmitPullRequestUpdateToolInput = t.TypeOf<
  typeof SubmitPullRequestUpdateToolInputCodec
>;

/** Input for the submit pull request merge OpenClaw tool. */
export type SubmitPullRequestMergeToolInput = t.TypeOf<
  typeof SubmitPullRequestMergeToolInputCodec
>;

/** Input for the plan rebase dependents OpenClaw tool. */
export type PlanRebaseDependentsToolInput = t.TypeOf<
  typeof PlanRebaseDependentsToolInputCodec
>;

/** Input for the execute rebase dependents OpenClaw tool. */
export type ExecuteRebaseDependentsToolInput = t.TypeOf<
  typeof ExecuteRebaseDependentsToolInputCodec
>;

/** Input for the submit GitHub action OpenClaw tool. */
export type SubmitGitHubActionToolInput = t.TypeOf<
  typeof SubmitGitHubActionToolInputCodec
>;

/** Input for the create GitHub action request OpenClaw tool. */
export type CreateGitHubActionRequestToolInput = t.TypeOf<
  typeof CreateGitHubActionRequestToolInputCodec
>;

/** Input for the claim task OpenClaw tool. */
export type ClaimTaskToolInput = t.TypeOf<typeof ClaimTaskToolInputCodec>;

/** Status accepted by the update task OpenClaw tool. */
export type UpdateTaskStatus = t.TypeOf<typeof UpdateTaskStatusCodec>;

/** Input for the update task OpenClaw tool. */
export type UpdateTaskToolInput = t.TypeOf<typeof UpdateTaskToolInputCodec>;

/** Input for the validate artifact OpenClaw tool. */
export type ValidateArtifactToolInput = t.TypeOf<
  typeof ValidateArtifactToolInputCodec
>;

/** Input for the run supervisor step OpenClaw tool. */
export type RunSupervisorStepToolInput = t.TypeOf<
  typeof RunSupervisorStepToolInputCodec
>;
