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

export const HandleDiscordControlToolInputCodec = DiscordControlRequestCodec;

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

export const ClaimTaskToolInputCodec = t.type({
  taskId: t.string,
  sliceId: t.string,
  threadId: t.string,
  assigneeId: t.string,
});

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

export const UpdateTaskToolInputCodec = t.type({
  taskId: t.string,
  sliceId: t.string,
  threadId: t.string,
  status: UpdateTaskStatusCodec,
});

export const ValidateArtifactToolInputCodec = t.type({
  artifact: t.UnknownRecord,
});

export const RunSupervisorStepToolInputCodec = t.type({
  action: t.string,
  actorId: t.string,
  privileged: t.boolean,
});
