import * as t from 'io-ts';

import { GitBranchNameCodec } from '@vannadii/devplat-core';
import {
  ApprovalRecordArtifactCodec,
  ArtifactEnvelopeCodec,
  ArtifactRegistryCodec,
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
import { CommandExecutionOptionsCodec } from '@vannadii/devplat-execution';
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

/** Codec for run gates tool input. */
export const RunGatesToolInputCodec = t.intersection([
  t.type({
    gateNames: t.array(t.string),
    summary: t.string,
  }),
  t.partial({
    actorId: t.string,
  }),
]);

/** Codec for create research brief tool input. */
export const CreateResearchBriefToolInputCodec = ResearchBriefCodec;

/** Codec for create spec record tool input. */
export const CreateSpecRecordToolInputCodec = SpecRecordCodec;

/** Codec for approve spec record tool input. */
export const ApproveSpecRecordToolInputCodec = SpecRecordCodec;

/** Codec for update spec record tool input. */
export const UpdateSpecRecordToolInputCodec = SpecRecordCodec;

/** Codec for create slice plan tool input. */
export const CreateSlicePlanToolInputCodec = SlicePlanCodec;

/** Codec for evaluate slice plan readiness tool input. */
export const EvaluateSlicePlanReadinessToolInputCodec = t.type({
  plan: SlicePlanCodec,
  completedSliceIds: t.array(t.string),
});

/** Codec for resolve runtime config tool input. */
export const ResolveRuntimeConfigToolInputCodec = t.type({
  env: t.record(t.string, t.string),
});

/** Codec for create open claw plugin config tool input. */
export const CreateOpenClawPluginConfigToolInputCodec = DevplatConfigCodec;

/** Codec for create artifact envelope tool input. */
export const CreateArtifactEnvelopeToolInputCodec = ArtifactEnvelopeCodec;

/** Codec for create approval record tool input. */
export const CreateApprovalRecordToolInputCodec = ApprovalRecordArtifactCodec;

/** Codec for create audit log tool input. */
export const CreateAuditLogToolInputCodec = AuditLogArtifactCodec;

/** Codec for create merge decision tool input. */
export const CreateMergeDecisionToolInputCodec = MergeDecisionArtifactCodec;

/** Codec for create rebase result tool input. */
export const CreateRebaseResultToolInputCodec = RebaseResultArtifactCodec;

/** OpenClaw command execution input using execution-owned option codecs. */
export const ExecuteCommandToolInputCodec = t.intersection([
  t.type({
    command: t.string,
    args: t.array(t.string),
    actorId: t.string,
    privileged: t.boolean,
  }),
  CommandExecutionOptionsCodec,
]);

/** Input for pure worktree allocation without disk materialization. */
export const AllocateWorktreePlanInputCodec = t.intersection([
  t.type({
    taskId: t.string,
    branchName: t.string,
  }),
  t.partial({
    baseBranch: GitBranchNameCodec,
    applyToDisk: t.literal(false),
  }),
]);

/** Input for Git-backed worktree allocation that requires an explicit base ref. */
export const AllocateWorktreeDiskInputCodec = t.type({
  taskId: t.string,
  branchName: t.string,
  baseBranch: GitBranchNameCodec,
  applyToDisk: t.literal(true),
});

/** Codec for allocate worktree tool input. */
export const AllocateWorktreeToolInputCodec = t.union([
  AllocateWorktreeDiskInputCodec,
  AllocateWorktreePlanInputCodec,
]);

/** Codec for sync worktree tool input. */
export const SyncWorktreeToolInputCodec = t.intersection([
  t.type({
    allocation: WorktreeAllocationCodec,
    baseBranch: GitBranchNameCodec,
  }),
  t.partial({
    syncMode: WorktreeSyncModeCodec,
    applyToDisk: t.boolean,
  }),
]);

/** Codec for release worktree tool input. */
export const ReleaseWorktreeToolInputCodec = t.intersection([
  t.type({
    allocation: WorktreeAllocationCodec,
  }),
  t.partial({
    releaseMode: WorktreeReleaseModeCodec,
    applyToDisk: t.boolean,
  }),
]);

/** Codec for bind discord thread tool input. */
export const BindDiscordThreadToolInputCodec = t.intersection([
  DiscordChannelBindingCodec,
  t.type({
    threadId: t.string,
    parentChannelId: t.string,
    actorId: t.string,
  }),
]);

/** Codec for open discord thread tool input. */
export const OpenDiscordThreadToolInputCodec = t.intersection([
  DiscordThreadSessionCodec,
  t.type({
    actorId: t.string,
  }),
]);

/** Codec for handle discord approval tool input. */
export const HandleDiscordApprovalToolInputCodec = DiscordApprovalRequestCodec;

/** Codec for handle discord control tool input. */
export const HandleDiscordControlToolInputCodec = t.union([
  DiscordControlRequestCodec,
  DiscordOperatorInteractionCodec,
]);

/** Codec for verify sonar bootstrap tool input. */
export const VerifySonarBootstrapToolInputCodec =
  SonarBootstrapVerificationInputCodec;

/** Codec for evaluate sonar quality gate tool input. */
export const EvaluateSonarQualityGateToolInputCodec = t.intersection([
  t.type({
    projectKey: t.string,
    overallCoverage: t.number,
    newCodeCoverage: t.number,
    blockingIssues: t.number,
  }),
  t.partial({
    actorId: t.string,
  }),
]);

/** Codec for create review finding tool input. */
export const CreateReviewFindingToolInputCodec = ReviewFindingCodec;

/** Codec for create remediation plan tool input. */
export const CreateRemediationPlanToolInputCodec = t.type({
  findings: t.array(ReviewFindingCodec),
  autofix: t.boolean,
});

/** Codec for remember memory entry tool input. */
export const RememberMemoryEntryToolInputCodec = MemoryEntryCodec;

/** Codec for evaluate policy action tool input. */
export const EvaluatePolicyActionToolInputCodec = t.type({
  action: t.string,
  privileged: t.boolean,
});

/** Codec for record telemetry event tool input. */
export const RecordTelemetryEventToolInputCodec = TelemetryEventCodec;

/** Codec for create task record tool input. */
export const CreateTaskRecordToolInputCodec = TaskRecordCodec;

/** Codec for read stored record tool input. */
export const ReadStoredRecordToolInputCodec = t.type({
  scope: StoreScopeCodec,
  key: t.string,
});

/** Codec for list stored records tool input. */
export const ListStoredRecordsToolInputCodec = t.type({
  scope: StoreScopeCodec,
});

/** Input codec for reading a storage secondary index entry. */
export const ReadStoredIndexToolInputCodec = t.type({
  indexName: StoreIndexNameCodec,
  key: t.string,
});

/** Input codec for reading a stored record through a secondary index. */
export const ReadIndexedRecordToolInputCodec = t.type({
  indexName: StoreIndexNameCodec,
  key: t.string,
});

/** Input codec for listing storage secondary index keys. */
export const ListStoredIndexToolInputCodec = t.type({
  indexName: StoreIndexNameCodec,
});

/** Codec for store record tool record. */
export const StoreRecordToolRecordCodec = StoredRecordCodec;

/** Codec for store record tool input. */
export const StoreRecordToolInputCodec = t.type({
  record: StoreRecordToolRecordCodec,
  actorId: t.string,
  privileged: t.boolean,
});

/** Codec for create pull request record tool input. */
export const CreatePullRequestRecordToolInputCodec = PullRequestRecordCodec;

/** Codec for submit pull request update tool input. */
export const SubmitPullRequestUpdateToolInputCodec = t.type({
  record: PullRequestRecordCodec,
  actorId: t.string,
});

/** Codec for submit pull request merge tool input. */
export const SubmitPullRequestMergeToolInputCodec = t.type({
  record: PullRequestRecordCodec,
  actorId: t.string,
});

/** Codec for plan rebase dependents tool input. */
export const PlanRebaseDependentsToolInputCodec = t.type({
  record: PullRequestRecordCodec,
  dependentBranches: t.array(t.string),
});

/** Codec for execute rebase dependents tool input. */
export const ExecuteRebaseDependentsToolInputCodec =
  ExecuteRebaseDependentsInputCodec;

/** Codec for submit git hub action tool input. */
export const SubmitGitHubActionToolInputCodec = t.type({
  request: GitHubActionRequestCodec,
  actorId: t.string,
});

/** Codec for create git hub action request tool input. */
export const CreateGitHubActionRequestToolInputCodec = GitHubActionRequestCodec;

/** Codec for claim task tool input. */
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

/** Codec for update task status. */
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

/** Codec for update task tool input. */
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

/** Input codec for validating artifacts against optional registry constraints. */
export const ValidateArtifactToolInputCodec = t.intersection([
  t.type({
    artifact: t.UnknownRecord,
  }),
  t.partial({
    registry: ArtifactRegistryCodec,
  }),
]);

/** Codec for run supervisor step tool input. */
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

/** Input for the read indexed record OpenClaw tool. */
export type ReadIndexedRecordToolInput = t.TypeOf<
  typeof ReadIndexedRecordToolInputCodec
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
