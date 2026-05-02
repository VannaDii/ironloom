import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AnyAgentTool } from 'openclaw/plugin-sdk/plugin-entry';
import type {
  DiscordControlResponseTransport,
  DiscordOperatorInteraction,
  DiscordThreadSession,
} from '@vannadii/devplat-discord';

import { RebaseDependentsService } from '@vannadii/devplat-branching';
import {
  ApprovalRecordArtifactService,
  ArtifactEnvelopeService,
  ArtifactValidationService,
  AuditLogArtifactService,
  MergeDecisionArtifactService,
  RebaseResultArtifactService,
} from '@vannadii/devplat-artifacts';
import {
  decodeWithCodec,
  DEVPLAT_ACTION_EXECUTE_COMMAND,
} from '@vannadii/devplat-core';
import {
  CommandExecutionService,
  normalizeCommandExecutionCwd,
} from '@vannadii/devplat-execution';
import { RuntimeConfigService } from '@vannadii/devplat-config';
import {
  DiscordChannelBindingService,
  DiscordControlPlaneService,
  DiscordInteractiveApprovalService,
  DiscordLoopbackResponseTransport,
  DiscordThreadSessionService,
} from '@vannadii/devplat-discord';
import { RunGatesService } from '@vannadii/devplat-gates';
import { GitHubWorkflowService } from '@vannadii/devplat-github';
import { MemoryEntryService } from '@vannadii/devplat-memory';
import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { PullRequestService } from '@vannadii/devplat-prs';
import { TaskQueueService, type TaskRecord } from '@vannadii/devplat-queue';
import { ResearchBriefService } from '@vannadii/devplat-research';
import { RemediationPlanService } from '@vannadii/devplat-remediation';
import { ReviewFindingsService } from '@vannadii/devplat-review';
import { SlicePlanService } from '@vannadii/devplat-slicing';
import {
  SonarBootstrapVerificationService,
  SonarQualityGateService,
} from '@vannadii/devplat-sonarcloud';
import { SpecRecordService } from '@vannadii/devplat-specs';
import { FileStoreService } from '@vannadii/devplat-storage';
import { SupervisorCycleService } from '@vannadii/devplat-supervisor';
import { WorktreeAllocationService } from '@vannadii/devplat-worktrees';

import { PluginConfigService } from '../plugin-config/index.js';
import {
  ApproveSpecRecordToolInputCodec,
  AllocateWorktreeToolInputCodec,
  BindDiscordThreadToolInputCodec,
  ClaimTaskToolInputCodec,
  CreateApprovalRecordToolInputCodec,
  CreateRemediationPlanToolInputCodec,
  CreateResearchBriefToolInputCodec,
  CreateReviewFindingToolInputCodec,
  CreateSlicePlanToolInputCodec,
  CreateArtifactEnvelopeToolInputCodec,
  CreateAuditLogToolInputCodec,
  CreateGitHubActionRequestToolInputCodec,
  CreateMergeDecisionToolInputCodec,
  CreateOpenClawPluginConfigToolInputCodec,
  CreatePullRequestRecordToolInputCodec,
  CreateRebaseResultToolInputCodec,
  CreateTaskRecordToolInputCodec,
  CreateSpecRecordToolInputCodec,
  ExecuteRebaseDependentsToolInputCodec,
  EvaluateSlicePlanReadinessToolInputCodec,
  ExecuteCommandToolInputCodec,
  EvaluatePolicyActionToolInputCodec,
  EvaluateSonarQualityGateToolInputCodec,
  HandleDiscordApprovalToolInputCodec,
  HandleDiscordControlToolInputCodec,
  ListStoredRecordsToolInputCodec,
  ListStoredIndexToolInputCodec,
  OpenDiscordThreadToolInputCodec,
  PlanRebaseDependentsToolInputCodec,
  ReadStoredRecordToolInputCodec,
  ReadStoredIndexToolInputCodec,
  RecordTelemetryEventToolInputCodec,
  ReleaseWorktreeToolInputCodec,
  RememberMemoryEntryToolInputCodec,
  ResolveRuntimeConfigToolInputCodec,
  RunGatesToolInputCodec,
  RunSupervisorStepToolInputCodec,
  StoreRecordToolInputCodec,
  SubmitGitHubActionToolInputCodec,
  SubmitPullRequestMergeToolInputCodec,
  SubmitPullRequestUpdateToolInputCodec,
  SyncWorktreeToolInputCodec,
  UpdateTaskToolInputCodec,
  UpdateSpecRecordToolInputCodec,
  ValidateArtifactToolInputCodec,
  VerifySonarBootstrapToolInputCodec,
} from './codec.js';
import {
  formatToolPayloadText,
  sanitizeToolPayloadForDisplay,
} from './logic.js';
import {
  LIST_STORED_INDEX_SCHEMA_FILE,
  LIST_STORED_INDEX_TOOL_NAME,
  OPENCLAW_GITHUB_OWNER_ENVIRONMENT_VARIABLE,
  OPENCLAW_GITHUB_REPO_ENVIRONMENT_VARIABLE,
  OPENCLAW_STORAGE_ROOT_ENVIRONMENT_VARIABLE,
  OPENCLAW_TEST_MODE_ENVIRONMENT_VARIABLE,
  OPENCLAW_WORKTREE_ROOT_ENVIRONMENT_VARIABLE,
  READ_STORED_INDEX_SCHEMA_FILE,
  READ_STORED_INDEX_TOOL_NAME,
} from './constants.js';
import type { OpenDiscordThreadToolInput } from './codec.js';

type ToolParameterSchema = AnyAgentTool['parameters'] & Record<string, unknown>;

/**
 * Minimal task identity accepted by legacy task lifecycle tool calls.
 */
type TaskRecordIdentity = {
  taskId: string;
  sliceId: string;
  threadId: string;
};

function isToolParameterSchema(value: unknown): value is ToolParameterSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSchema(fileName: string): ToolParameterSchema {
  const filePath = resolve(
    import.meta.dirname,
    '..',
    '..',
    'schemas',
    fileName,
  );
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isToolParameterSchema(parsed)) {
    throw new Error(`Schema ${fileName} must contain a JSON object.`);
  }

  return parsed;
}

function createTextResult(payload: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  details: unknown;
} {
  const safePayload = sanitizeToolPayloadForDisplay(payload);

  return {
    content: [
      {
        type: 'text',
        text: formatToolPayloadText(safePayload),
      },
    ],
    details: safePayload,
  };
}

function toDiscordThreadSession(
  input: OpenDiscordThreadToolInput,
): DiscordThreadSession {
  return input;
}

function isDiscordOperatorInteraction(
  input:
    | DiscordOperatorInteraction
    | Parameters<DiscordControlPlaneService['handleAction']>[0],
): input is DiscordOperatorInteraction {
  return 'token' in input;
}

function createLoopbackDiscordResponseTransport(): DiscordControlResponseTransport {
  return new DiscordLoopbackResponseTransport();
}

/**
 * Resolves the optional storage root from the runtime environment.
 */
function resolveConfiguredStorageRoot(): string | undefined {
  const storageRoot =
    process.env[OPENCLAW_STORAGE_ROOT_ENVIRONMENT_VARIABLE]?.trim();
  return storageRoot === undefined || storageRoot.length === 0
    ? undefined
    : storageRoot;
}

/**
 * Resolves the optional worktree root from the runtime environment.
 */
function resolveConfiguredWorktreeRoot(): string | undefined {
  const worktreeRoot =
    process.env[OPENCLAW_WORKTREE_ROOT_ENVIRONMENT_VARIABLE]?.trim();

  return worktreeRoot === undefined || worktreeRoot.length === 0
    ? undefined
    : worktreeRoot;
}

/**
 * Resolves the optional repository identity from the runtime environment.
 */
function resolveConfiguredRepositoryFullName(): string | undefined {
  const owner = process.env[OPENCLAW_GITHUB_OWNER_ENVIRONMENT_VARIABLE]?.trim();
  const repo = process.env[OPENCLAW_GITHUB_REPO_ENVIRONMENT_VARIABLE]?.trim();

  return owner === undefined ||
    owner.length === 0 ||
    repo === undefined ||
    repo.length === 0
    ? undefined
    : `${owner}/${repo}`;
}

/**
 * Creates the file store for OpenClaw-invoked persistence tools.
 */
function createDefaultFileStoreService(): FileStoreService {
  const storageRoot = resolveConfiguredStorageRoot();
  return storageRoot === undefined
    ? new FileStoreService()
    : new FileStoreService(storageRoot);
}

/**
 * Creates telemetry recording backed by the configured OpenClaw storage root.
 */
function createDefaultTelemetryEventService(): TelemetryEventService {
  return new TelemetryEventService(createDefaultFileStoreService());
}

/**
 * Creates worktree allocation with the configured runtime worktree root.
 */
function createDefaultWorktreeAllocationService(): WorktreeAllocationService {
  const worktreeRoot = resolveConfiguredWorktreeRoot();

  return worktreeRoot === undefined
    ? new WorktreeAllocationService()
    : new WorktreeAllocationService(undefined, undefined, worktreeRoot);
}

/**
 * Creates dependent rebase orchestration with the configured worktree root.
 */
function createDefaultRebaseDependentsService(): RebaseDependentsService {
  return new RebaseDependentsService(createDefaultWorktreeAllocationService());
}

/**
 * Creates the Discord binding service with normalized runtime persistence.
 */
function createDefaultDiscordChannelBindingService(): DiscordChannelBindingService {
  return new DiscordChannelBindingService(
    createDefaultTelemetryEventService(),
    createDefaultFileStoreService(),
  );
}

/**
 * Creates the Discord thread-session service with normalized runtime persistence.
 */
function createDefaultDiscordThreadSessionService(): DiscordThreadSessionService {
  return new DiscordThreadSessionService(
    new ArtifactEnvelopeService(),
    createDefaultTelemetryEventService(),
    createDefaultFileStoreService(),
  );
}

/**
 * Creates the Discord approval service with normalized runtime persistence.
 */
function createDefaultDiscordInteractiveApprovalService(): DiscordInteractiveApprovalService {
  return new DiscordInteractiveApprovalService(
    new DecisionPolicyService(),
    new ArtifactEnvelopeService(),
    createDefaultTelemetryEventService(),
    createDefaultFileStoreService(),
  );
}

/**
 * Creates the GitHub workflow service with normalized telemetry persistence.
 */
function createDefaultGitHubWorkflowService(): GitHubWorkflowService {
  return new GitHubWorkflowService(
    new DecisionPolicyService(),
    createDefaultTelemetryEventService(),
  );
}

/**
 * Creates the pull-request service with normalized GitHub telemetry persistence.
 */
function createDefaultPullRequestService(): PullRequestService {
  const repoFullName = resolveConfiguredRepositoryFullName();
  const githubWorkflowService = createDefaultGitHubWorkflowService();

  return repoFullName === undefined
    ? new PullRequestService(githubWorkflowService)
    : new PullRequestService(githubWorkflowService, repoFullName);
}

/**
 * Creates the supervisor service with normalized telemetry persistence.
 */
function createDefaultSupervisorCycleService(): SupervisorCycleService {
  return new SupervisorCycleService(
    new DecisionPolicyService(),
    createDefaultTelemetryEventService(),
  );
}

/**
 * Creates the Discord control-plane service with normalized runtime persistence.
 */
function createDefaultDiscordControlPlaneService(): DiscordControlPlaneService {
  const storageRoot = resolveConfiguredStorageRoot();
  const testMode = process.env[OPENCLAW_TEST_MODE_ENVIRONMENT_VARIABLE]?.trim();
  const store =
    storageRoot === undefined ? undefined : new FileStoreService(storageRoot);
  const telemetry =
    store === undefined ? undefined : new TelemetryEventService(store);
  const transport =
    testMode === undefined || testMode.length === 0
      ? undefined
      : createLoopbackDiscordResponseTransport();

  if (telemetry !== undefined || transport !== undefined) {
    return new DiscordControlPlaneService(
      undefined,
      telemetry,
      store,
      transport,
    );
  }

  return new DiscordControlPlaneService();
}

/**
 * Builds the synthetic queue record used by legacy ID-only task tool inputs.
 */
function createFallbackTaskRecord(input: TaskRecordIdentity): TaskRecord {
  return {
    id: `task-${input.taskId}`,
    summary: `Task ${input.taskId}`,
    status: 'queued',
    trace: [],
    updatedAt: new Date().toISOString(),
    taskId: input.taskId,
    sliceId: input.sliceId,
    threadId: input.threadId,
  };
}

/**
 * Resolves the durable queue record that a task lifecycle tool should mutate.
 */
function resolveTaskRecord(
  input: TaskRecordIdentity & {
    record?: TaskRecord;
  },
): TaskRecord {
  return input.record ?? createFallbackTaskRecord(input);
}

export function createRunGatesTool(
  runGatesService: Pick<RunGatesService, 'run'> = new RunGatesService(),
): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'run_gates',
    label: 'Run Gates',
    description:
      'Run the configured DevPlat gate suite through the execution runtime.',
    parameters: readSchema('tool-run-gates-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const rawParams: unknown = params;
      const decoded = decodeWithCodec(RunGatesToolInputCodec, rawParams);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const report = await runGatesService.run(
        decoded.value.gateNames,
        decoded.value.summary,
      );
      return createTextResult(report);
    },
  };

  return tool;
}

export function createResearchBriefTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_research_brief',
    label: 'Create Research Brief',
    description:
      'Normalize a research brief and return it as a structured DevPlat artifact.',
    parameters: readSchema('tool-create-research-brief-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateResearchBriefToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new ResearchBriefService().toArtifact(decoded.value);
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createSpecRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_spec_record',
    label: 'Create Spec Record',
    description:
      'Normalize a spec record and return it as a structured DevPlat artifact.',
    parameters: readSchema('tool-create-spec-record-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(CreateSpecRecordToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new SpecRecordService().toArtifact(decoded.value);
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createApproveSpecRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'approve_spec_record',
    label: 'Approve Spec Record',
    description:
      'Approve a spec record and return it as a structured DevPlat artifact.',
    parameters: readSchema('tool-approve-spec-record-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(ApproveSpecRecordToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const specs = new SpecRecordService();
      const artifact = specs.toArtifact(specs.approve(decoded.value));
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createUpdateSpecRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'update_spec_record',
    label: 'Update Spec Record',
    description:
      'Create a revised spec record, increment its version, and return the updated artifact.',
    parameters: readSchema('tool-update-spec-record-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(UpdateSpecRecordToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const specs = new SpecRecordService();
      const artifact = specs.toArtifact(specs.update(decoded.value));
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createSlicePlanTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_slice_plan',
    label: 'Create Slice Plan',
    description:
      'Normalize a dependency-aware slice plan for implementation routing.',
    parameters: readSchema('tool-create-slice-plan-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(CreateSlicePlanToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const plan = new SlicePlanService().plan(decoded.value);
      return Promise.resolve(createTextResult(plan));
    },
  };

  return tool;
}

export function createEvaluateSlicePlanReadinessTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'evaluate_slice_plan_readiness',
    label: 'Evaluate Slice Plan Readiness',
    description:
      'Evaluate whether a slice plan is ready for execution given completed dependencies.',
    parameters: readSchema(
      'tool-evaluate-slice-plan-readiness-params.schema.json',
    ),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        EvaluateSlicePlanReadinessToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const slicing = new SlicePlanService();
      const plan = slicing.plan(decoded.value.plan);
      const ready = slicing.readyForExecution(
        plan,
        decoded.value.completedSliceIds,
      );
      return Promise.resolve(
        createTextResult({
          plan,
          completedSliceIds: decoded.value.completedSliceIds,
          ready,
        }),
      );
    },
  };

  return tool;
}

export function createResolveRuntimeConfigTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'resolve_runtime_config',
    label: 'Resolve Runtime Config',
    description:
      'Resolve a normalized DevPlat runtime config from an environment-style input map.',
    parameters: readSchema('tool-resolve-runtime-config-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        ResolveRuntimeConfigToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const config = new RuntimeConfigService().fromEnvironment(
        decoded.value.env,
      );
      return Promise.resolve(createTextResult(config));
    },
  };

  return tool;
}

export function createOpenClawPluginConfigTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_openclaw_plugin_config',
    label: 'Create OpenClaw Plugin Config',
    description:
      'Translate a normalized DevPlat runtime config into an OpenClaw plugin config.',
    parameters: readSchema(
      'tool-create-openclaw-plugin-config-params.schema.json',
    ),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateOpenClawPluginConfigToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const config = new PluginConfigService().fromRuntimeConfig(decoded.value);
      return Promise.resolve(createTextResult(config));
    },
  };

  return tool;
}

export function createArtifactEnvelopeTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_artifact_envelope',
    label: 'Create Artifact Envelope',
    description:
      'Normalize a generic artifact envelope against the shared artifact contract.',
    parameters: readSchema('tool-create-artifact-envelope-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateArtifactEnvelopeToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new ArtifactEnvelopeService().execute(decoded.value);
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createApprovalRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_approval_record',
    label: 'Create Approval Record',
    description:
      'Normalize an approval-record artifact for auditable approval decisions.',
    parameters: readSchema('tool-create-approval-record-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateApprovalRecordToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new ApprovalRecordArtifactService().execute(
        decoded.value,
      );
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createAuditLogTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_audit_log',
    label: 'Create Audit Log',
    description:
      'Normalize an audit-log artifact for operator-visible control actions.',
    parameters: readSchema('tool-create-audit-log-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(CreateAuditLogToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new AuditLogArtifactService().execute(decoded.value);
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createMergeDecisionTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_merge_decision',
    label: 'Create Merge Decision',
    description:
      'Normalize a merge-decision artifact for PR merge approval outcomes.',
    parameters: readSchema('tool-create-merge-decision-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateMergeDecisionToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new MergeDecisionArtifactService().execute(
        decoded.value,
      );
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createRebaseResultTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_rebase_result',
    label: 'Create Rebase Result',
    description:
      'Normalize a rebase-result artifact for downstream branch refresh outcomes.',
    parameters: readSchema('tool-create-rebase-result-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(CreateRebaseResultToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new RebaseResultArtifactService().execute(decoded.value);
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createExecuteCommandTool(
  dependencies: {
    commandExecutionService?: Pick<CommandExecutionService, 'execute'>;
    decisionPolicyService?: Pick<
      DecisionPolicyService,
      'evaluateControlAction'
    >;
    telemetryEventService?: Pick<TelemetryEventService, 'record'>;
  } = {},
): AnyAgentTool {
  const commandExecutionService =
    dependencies.commandExecutionService ?? new CommandExecutionService();
  const decisionPolicyService =
    dependencies.decisionPolicyService ?? new DecisionPolicyService();
  const telemetryEventService =
    dependencies.telemetryEventService ??
    new TelemetryEventService(createDefaultFileStoreService());

  const tool: AnyAgentTool = {
    name: 'execute_command',
    label: 'Execute Command',
    description:
      'Run a structured subprocess request through the DevPlat execution runtime when policy allows it.',
    parameters: readSchema('tool-execute-command-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(ExecuteCommandToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const request = decoded.value;
      const policy = decisionPolicyService.evaluateControlAction(
        DEVPLAT_ACTION_EXECUTE_COMMAND,
        request.privileged,
      );

      if (!policy.allowed) {
        await telemetryEventService.record({
          id: `telemetry:execute-command:${String(Date.now())}`,
          summary: `Blocked command execution for ${request.command}`,
          status: 'blocked',
          trace: ['openclaw:execute-command'],
          updatedAt: new Date().toISOString(),
          actorId: request.actorId,
          action: DEVPLAT_ACTION_EXECUTE_COMMAND,
          scope: 'supervisor',
          details: {
            command: request.command,
            args: request.args,
            blocked: true,
          },
        });
        return createTextResult({
          allowed: false,
          policyDecisionId: policy.id,
          request: {
            command: request.command,
            args: request.args,
            cwd: request.cwd ?? null,
            timeoutMs: request.timeoutMs ?? null,
          },
        });
      }

      const normalizedCwd = normalizeCommandExecutionCwd(request.cwd);
      if (!normalizedCwd.ok) {
        return createTextResult({
          status: 'failed',
          error: normalizedCwd.error,
        });
      }

      const result = await commandExecutionService.execute(
        request.command,
        request.args,
        {
          ...(normalizedCwd.value ? { cwd: normalizedCwd.value } : {}),
          ...(request.env ? { env: request.env } : {}),
          ...(typeof request.timeoutMs === 'number'
            ? { timeoutMs: request.timeoutMs }
            : {}),
        },
      );

      await telemetryEventService.record({
        id: `telemetry:execute-command:${String(Date.now())}`,
        summary: `Executed ${request.command}`,
        status:
          result.exitCode === 0 && !result.timedOut ? 'approved' : 'failed',
        trace: ['openclaw:execute-command'],
        updatedAt: new Date().toISOString(),
        actorId: request.actorId,
        action: DEVPLAT_ACTION_EXECUTE_COMMAND,
        scope: 'supervisor',
        details: {
          command: request.command,
          args: request.args,
          cwd: normalizedCwd.value ?? null,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        },
      });

      return createTextResult({
        allowed: true,
        policyDecisionId: policy.id,
        request: {
          command: request.command,
          args: request.args,
          cwd: normalizedCwd.value ?? null,
          timeoutMs: request.timeoutMs ?? null,
        },
        result,
      });
    },
  };

  return tool;
}

export function createAllocateWorktreeTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'allocate_worktree',
    label: 'Allocate Worktree',
    description: 'Allocate a deterministic worktree path for a task branch.',
    parameters: readSchema('tool-allocate-worktree-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const rawParams: unknown = params;
      const decoded = decodeWithCodec(
        AllocateWorktreeToolInputCodec,
        rawParams,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const allocation = createDefaultWorktreeAllocationService().allocate(
        decoded.value.taskId,
        decoded.value.branchName,
      );
      return Promise.resolve(createTextResult(allocation));
    },
  };

  return tool;
}

export function createSyncWorktreeTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'sync_worktree',
    label: 'Sync Worktree',
    description:
      'Synchronize an allocated worktree with its base branch using an explicit sync mode.',
    parameters: readSchema('tool-sync-worktree-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(SyncWorktreeToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const result = createDefaultWorktreeAllocationService().sync(
        decoded.value.allocation,
        decoded.value.baseBranch,
        decoded.value.syncMode,
      );
      return Promise.resolve(createTextResult(result));
    },
  };

  return tool;
}

export function createReleaseWorktreeTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'release_worktree',
    label: 'Release Worktree',
    description:
      'Release an allocated worktree using an explicit cleanup strategy.',
    parameters: readSchema('tool-release-worktree-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(ReleaseWorktreeToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const result = createDefaultWorktreeAllocationService().release(
        decoded.value.allocation,
        decoded.value.releaseMode,
      );
      return Promise.resolve(createTextResult(result));
    },
  };

  return tool;
}

export function createBindDiscordThreadTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'bind_discord_thread',
    label: 'Bind Discord Thread',
    description:
      'Bind a Discord thread to a deterministic spec, implementation, or audit routing key.',
    parameters: readSchema('tool-bind-discord-thread-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(BindDiscordThreadToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result =
        await createDefaultDiscordChannelBindingService().bindThread(
          {
            id: decoded.value.id,
            summary: decoded.value.summary,
            status: decoded.value.status,
            trace: decoded.value.trace,
            updatedAt: decoded.value.updatedAt,
            guildId: decoded.value.guildId,
            channelId: decoded.value.channelId,
            kind: decoded.value.kind,
            threadBindingMode: decoded.value.threadBindingMode,
          },
          decoded.value.threadId,
          decoded.value.parentChannelId,
          decoded.value.actorId,
        );
      return createTextResult(result);
    },
  };

  return tool;
}

export function createOpenDiscordThreadTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'open_discord_thread',
    label: 'Open Discord Thread',
    description:
      'Open and persist a Discord spec, implementation, or pull-request thread session with audit artifacts.',
    parameters: readSchema('tool-open-discord-thread-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(OpenDiscordThreadToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result =
        await createDefaultDiscordThreadSessionService().openThread(
          toDiscordThreadSession(decoded.value),
          decoded.value.actorId,
        );
      return createTextResult(result);
    },
  };

  return tool;
}

export function createHandleDiscordApprovalTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'handle_discord_approval',
    label: 'Handle Discord Approval',
    description:
      'Process a Discord approval action with policy enforcement, audit artifacts, and telemetry.',
    parameters: readSchema('tool-handle-discord-approval-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        HandleDiscordApprovalToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result =
        await createDefaultDiscordInteractiveApprovalService().handleApproval(
          decoded.value,
        );
      return createTextResult(result);
    },
  };

  return tool;
}

export function createHandleDiscordControlTool(
  dependencies: {
    discordControlPlaneService?: Pick<
      DiscordControlPlaneService,
      'handleAction' | 'handleInteraction'
    >;
  } = {},
): AnyAgentTool {
  const discordControlPlaneService =
    dependencies.discordControlPlaneService ??
    createDefaultDiscordControlPlaneService();
  const tool: AnyAgentTool = {
    name: 'handle_discord_control',
    label: 'Handle Discord Control',
    description:
      'Process a thread-scoped Discord control action or operator interaction with policy checks and telemetry.',
    parameters: readSchema('tool-handle-discord-control-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        HandleDiscordControlToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result = isDiscordOperatorInteraction(decoded.value)
        ? await discordControlPlaneService.handleInteraction(decoded.value)
        : await discordControlPlaneService.handleAction(decoded.value);
      return createTextResult(result);
    },
  };

  return tool;
}

export function createVerifySonarBootstrapTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'verify_sonar_bootstrap',
    label: 'Verify Sonar Bootstrap',
    description:
      'Verify that the configured Sonar project has a computed, passing quality gate with 90% overall and new-code coverage thresholds.',
    parameters: readSchema('tool-verify-sonar-bootstrap-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        VerifySonarBootstrapToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const result = new SonarBootstrapVerificationService().execute(
        decoded.value,
      );
      return Promise.resolve(createTextResult(result));
    },
  };

  return tool;
}

export function createEvaluateSonarQualityGateTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'evaluate_sonar_quality_gate',
    label: 'Evaluate Sonar Quality Gate',
    description:
      'Evaluate Sonar coverage and blocking-issue thresholds against DevPlat policy.',
    parameters: readSchema(
      'tool-evaluate-sonar-quality-gate-params.schema.json',
    ),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        EvaluateSonarQualityGateToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const result = new SonarQualityGateService().evaluate(
        decoded.value.projectKey,
        decoded.value.overallCoverage,
        decoded.value.newCodeCoverage,
        decoded.value.blockingIssues,
      );
      return Promise.resolve(createTextResult(result));
    },
  };

  return tool;
}

export function createReviewFindingTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_review_finding',
    label: 'Create Review Finding',
    description:
      'Normalize a review finding and return it as a structured DevPlat artifact.',
    parameters: readSchema('tool-create-review-finding-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateReviewFindingToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new ReviewFindingsService().toArtifact(decoded.value);
      return Promise.resolve(createTextResult(artifact));
    },
  };

  return tool;
}

export function createRemediationPlanTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_remediation_plan',
    label: 'Create Remediation Plan',
    description:
      'Create a remediation plan from review findings while preserving approval rules.',
    parameters: readSchema('tool-create-remediation-plan-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateRemediationPlanToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const plan = new RemediationPlanService().fromFindings(
        decoded.value.findings,
        decoded.value.autofix,
      );
      return Promise.resolve(createTextResult(plan));
    },
  };

  return tool;
}

export function createRememberMemoryEntryTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'remember_memory_entry',
    label: 'Remember Memory Entry',
    description:
      'Normalize and persist a long-lived project memory entry through DevPlat storage.',
    parameters: readSchema('tool-remember-memory-entry-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        RememberMemoryEntryToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const entry = await new MemoryEntryService(
        createDefaultFileStoreService(),
      ).execute(decoded.value);
      return createTextResult(entry);
    },
  };

  return tool;
}

export function createEvaluatePolicyActionTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'evaluate_policy_action',
    label: 'Evaluate Policy Action',
    description:
      'Evaluate whether a proposed control action is automatically allowed or requires approval.',
    parameters: readSchema('tool-evaluate-policy-action-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        EvaluatePolicyActionToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const decision = new DecisionPolicyService().evaluateLifecycleAction(
        decoded.value.action,
        decoded.value.privileged,
      );
      return Promise.resolve(createTextResult(decision));
    },
  };

  return tool;
}

export function createRecordTelemetryEventTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'record_telemetry_event',
    label: 'Record Telemetry Event',
    description:
      'Normalize and persist a telemetry event for Discord, GitHub, supervisor, or storage activity.',
    parameters: readSchema('tool-record-telemetry-event-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        RecordTelemetryEventToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const event = await new TelemetryEventService(
        createDefaultFileStoreService(),
      ).execute(decoded.value);
      return createTextResult(event);
    },
  };

  return tool;
}

export function createTaskRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_task_record',
    label: 'Create Task Record',
    description:
      'Normalize a queue task record before claim, execution, review, and merge lifecycle updates.',
    parameters: readSchema('tool-create-task-record-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(CreateTaskRecordToolInputCodec, params);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const record = new TaskQueueService().execute(decoded.value);
      return Promise.resolve(createTextResult(record));
    },
  };

  return tool;
}

export function createReadStoredRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'read_stored_record',
    label: 'Read Stored Record',
    description:
      'Read a stored DevPlat record from the file-backed Phase 0 storage layer.',
    parameters: readSchema('tool-read-stored-record-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(ReadStoredRecordToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result = await createDefaultFileStoreService().read(
        decoded.value.scope,
        decoded.value.key,
      );
      if (!result.ok) {
        return createTextResult({
          status: 'failed',
          scope: decoded.value.scope,
          key: decoded.value.key,
          error: result.error,
        });
      }

      return createTextResult({
        status: 'ok',
        scope: decoded.value.scope,
        key: decoded.value.key,
        record: result.value,
      });
    },
  };

  return tool;
}

export function createListStoredRecordsTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'list_stored_records',
    label: 'List Stored Records',
    description:
      'List stored record keys by scope from the file-backed Phase 0 storage layer.',
    parameters: readSchema('tool-list-stored-records-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(ListStoredRecordsToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const keys = await createDefaultFileStoreService().list(
        decoded.value.scope,
      );
      return createTextResult({
        status: 'ok',
        scope: decoded.value.scope,
        keys,
      });
    },
  };

  return tool;
}

/** Creates the OpenClaw tool that reads a storage secondary index entry. */
export function createReadStoredIndexTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: READ_STORED_INDEX_TOOL_NAME,
    label: 'Read Stored Index',
    description:
      'Read a stored DevPlat secondary index entry from the file-backed storage layer.',
    parameters: readSchema(READ_STORED_INDEX_SCHEMA_FILE),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(ReadStoredIndexToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result = await createDefaultFileStoreService().readIndex(
        decoded.value.indexName,
        decoded.value.key,
      );
      if (!result.ok) {
        return createTextResult({
          status: 'failed',
          indexName: decoded.value.indexName,
          key: decoded.value.key,
          error: result.error,
        });
      }

      return createTextResult({
        status: 'ok',
        indexName: decoded.value.indexName,
        key: decoded.value.key,
        entry: result.value,
      });
    },
  };

  return tool;
}

/** Creates the OpenClaw tool that lists storage secondary index keys. */
export function createListStoredIndexTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: LIST_STORED_INDEX_TOOL_NAME,
    label: 'List Stored Index',
    description:
      'List stored DevPlat secondary index keys from the file-backed storage layer.',
    parameters: readSchema(LIST_STORED_INDEX_SCHEMA_FILE),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(ListStoredIndexToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const keys = await createDefaultFileStoreService().listIndex(
        decoded.value.indexName,
      );
      return createTextResult({
        status: 'ok',
        indexName: decoded.value.indexName,
        keys,
      });
    },
  };

  return tool;
}

export function createStoreRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'store_record',
    label: 'Store Record',
    description:
      'Persist a structured DevPlat record through the file-backed Phase 0 storage layer when policy allows it.',
    parameters: readSchema('tool-store-record-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(StoreRecordToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const request = decoded.value;
      const policy = new DecisionPolicyService().evaluateControlAction(
        'store-record',
        request.privileged,
      );

      if (!policy.allowed) {
        await new TelemetryEventService(createDefaultFileStoreService()).record(
          {
            id: `telemetry:store-record:${String(Date.now())}`,
            summary: `Blocked record storage for ${request.record.scope}/${request.record.key}`,
            status: 'blocked',
            trace: ['openclaw:store-record'],
            updatedAt: new Date().toISOString(),
            actorId: request.actorId,
            action: 'store-record',
            scope: 'storage',
            details: {
              scope: request.record.scope,
              key: request.record.key,
              blocked: true,
            },
          },
        );
        return createTextResult({
          allowed: false,
          policyDecisionId: policy.id,
          scope: request.record.scope,
          key: request.record.key,
        });
      }

      const store = createDefaultFileStoreService();
      const record = await store.store(request.record);
      await new TelemetryEventService(store).record({
        id: `telemetry:store-record:${String(Date.now())}`,
        summary: `Stored record ${record.scope}/${record.key}`,
        status: 'approved',
        trace: ['openclaw:store-record'],
        updatedAt: new Date().toISOString(),
        actorId: request.actorId,
        action: 'store-record',
        scope: 'storage',
        details: {
          scope: record.scope,
          key: record.key,
          status: record.status,
        },
      });

      return createTextResult({
        allowed: true,
        policyDecisionId: policy.id,
        record,
      });
    },
  };

  return tool;
}

export function createPullRequestRecordTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_pull_request_record',
    label: 'Create Pull Request Record',
    description:
      'Normalize a pull request record before review, merge-readiness, and GitHub update decisions.',
    parameters: readSchema(
      'tool-create-pull-request-record-params.schema.json',
    ),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreatePullRequestRecordToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const record = new PullRequestService().create(decoded.value);
      return Promise.resolve(createTextResult(record));
    },
  };

  return tool;
}

export function createSubmitPullRequestUpdateTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'submit_pull_request_update',
    label: 'Submit Pull Request Update',
    description:
      'Submit a pull request update decision through the GitHub workflow adapter.',
    parameters: readSchema(
      'tool-submit-pull-request-update-params.schema.json',
    ),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        SubmitPullRequestUpdateToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result = await createDefaultPullRequestService().submitUpdate(
        decoded.value.record,
        decoded.value.actorId,
      );
      return createTextResult(result);
    },
  };

  return tool;
}

export function createSubmitPullRequestMergeTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'submit_pull_request_merge',
    label: 'Submit Pull Request Merge',
    description:
      'Submit a merge-ready pull request through the GitHub workflow adapter.',
    parameters: readSchema('tool-submit-pull-request-merge-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        SubmitPullRequestMergeToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result = await createDefaultPullRequestService().submitMerge(
        decoded.value.record,
        decoded.value.actorId,
      );
      return createTextResult(result);
    },
  };

  return tool;
}

export function createPlanRebaseDependentsTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'plan_rebase_dependents',
    label: 'Plan Rebase Dependents',
    description:
      'Create a downstream rebase plan for branches that depend on a merged pull request.',
    parameters: readSchema('tool-plan-rebase-dependents-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        PlanRebaseDependentsToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const plan = new RebaseDependentsService().createForMerge(
        decoded.value.record,
        decoded.value.dependentBranches,
      );
      return Promise.resolve(createTextResult(plan));
    },
  };

  return tool;
}

export function createExecuteRebaseDependentsTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'execute_rebase_dependents',
    label: 'Execute Rebase Dependents',
    description:
      'Plan and execute dependent branch refreshes through explicit worktree sync operations.',
    parameters: readSchema('tool-execute-rebase-dependents-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        ExecuteRebaseDependentsToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const result = createDefaultRebaseDependentsService().executeForMerge(
        decoded.value,
      );
      return Promise.resolve(createTextResult(result));
    },
  };

  return tool;
}

export function createSubmitGitHubActionTool(
  gitHubWorkflowService: Pick<
    GitHubWorkflowService,
    'submit'
  > = createDefaultGitHubWorkflowService(),
): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'submit_github_action',
    label: 'Submit GitHub Action',
    description:
      'Submit a GitHub workflow action request through the policy- and telemetry-aware adapter.',
    parameters: readSchema('tool-submit-github-action-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(SubmitGitHubActionToolInputCodec, params);
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const result = await gitHubWorkflowService.submit(
        decoded.value.request,
        decoded.value.actorId,
      );
      return createTextResult(result);
    },
  };

  return tool;
}

export function createGitHubActionRequestTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'create_github_action_request',
    label: 'Create GitHub Action Request',
    description:
      'Normalize a GitHub workflow action request before submission.',
    parameters: readSchema(
      'tool-create-github-action-request-params.schema.json',
    ),
    execute(_toolCallId: string, params: unknown) {
      const decoded = decodeWithCodec(
        CreateGitHubActionRequestToolInputCodec,
        params,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const request = new GitHubWorkflowService().prepare(decoded.value);
      return Promise.resolve(createTextResult(request));
    },
  };

  return tool;
}

export function createClaimTaskTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'claim_task',
    label: 'Claim Task',
    description: 'Claim a queued task for a specific assignee.',
    parameters: readSchema('tool-claim-task-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const rawParams: unknown = params;
      const decoded = decodeWithCodec(ClaimTaskToolInputCodec, rawParams);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const claimed = new TaskQueueService().claim(
        resolveTaskRecord(decoded.value),
        decoded.value.assigneeId,
      );
      return Promise.resolve(createTextResult(claimed));
    },
  };

  return tool;
}

export function createUpdateTaskTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'update_task',
    label: 'Update Task',
    description: 'Update a task lifecycle state.',
    parameters: readSchema('tool-update-task-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const rawParams: unknown = params;
      const decoded = decodeWithCodec(UpdateTaskToolInputCodec, rawParams);
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const task = new TaskQueueService().updateStatus(
        resolveTaskRecord(decoded.value),
        decoded.value.status,
      );
      return Promise.resolve(createTextResult(task));
    },
  };

  return tool;
}

export function createValidateArtifactTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'validate_artifact',
    label: 'Validate Artifact',
    description:
      'Validate an artifact envelope against the shared artifact contract.',
    parameters: readSchema('tool-validate-artifact-params.schema.json'),
    execute(_toolCallId: string, params: unknown) {
      const rawParams: unknown = params;
      const decoded = decodeWithCodec(
        ValidateArtifactToolInputCodec,
        rawParams,
      );
      if (!decoded.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: decoded.error }),
        );
      }

      const artifact = new ArtifactValidationService().execute(
        decoded.value.artifact,
      );
      if (!artifact.ok) {
        return Promise.resolve(
          createTextResult({ status: 'failed', error: artifact.error }),
        );
      }

      return Promise.resolve(createTextResult(artifact.value));
    },
  };

  return tool;
}

export function createRunSupervisorStepTool(): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: 'run_supervisor_step',
    label: 'Run Supervisor Step',
    description:
      'Run a single supervisor step with policy and telemetry recording.',
    parameters: readSchema('tool-run-supervisor-step-params.schema.json'),
    async execute(_toolCallId: string, params: unknown) {
      const rawParams: unknown = params;
      const decoded = decodeWithCodec(
        RunSupervisorStepToolInputCodec,
        rawParams,
      );
      if (!decoded.ok) {
        return createTextResult({ status: 'failed', error: decoded.error });
      }

      const decision = await createDefaultSupervisorCycleService().runStep(
        decoded.value,
      );
      return createTextResult(decision);
    },
  };

  return tool;
}

/**
 * Creates the full DevPlat OpenClaw tool inventory in registration order.
 */
export function createDevplatOpenClawTools(): AnyAgentTool[] {
  return [
    createResearchBriefTool(),
    createSpecRecordTool(),
    createApproveSpecRecordTool(),
    createUpdateSpecRecordTool(),
    createSlicePlanTool(),
    createEvaluateSlicePlanReadinessTool(),
    createResolveRuntimeConfigTool(),
    createOpenClawPluginConfigTool(),
    createArtifactEnvelopeTool(),
    createApprovalRecordTool(),
    createAuditLogTool(),
    createMergeDecisionTool(),
    createRebaseResultTool(),
    createExecuteCommandTool(),
    createRunGatesTool(),
    createAllocateWorktreeTool(),
    createSyncWorktreeTool(),
    createReleaseWorktreeTool(),
    createBindDiscordThreadTool(),
    createOpenDiscordThreadTool(),
    createHandleDiscordApprovalTool(),
    createHandleDiscordControlTool(),
    createVerifySonarBootstrapTool(),
    createEvaluateSonarQualityGateTool(),
    createReviewFindingTool(),
    createRemediationPlanTool(),
    createRememberMemoryEntryTool(),
    createEvaluatePolicyActionTool(),
    createRecordTelemetryEventTool(),
    createTaskRecordTool(),
    createClaimTaskTool(),
    createUpdateTaskTool(),
    createReadStoredRecordTool(),
    createListStoredRecordsTool(),
    createReadStoredIndexTool(),
    createListStoredIndexTool(),
    createStoreRecordTool(),
    createPullRequestRecordTool(),
    createSubmitPullRequestUpdateTool(),
    createSubmitPullRequestMergeTool(),
    createPlanRebaseDependentsTool(),
    createExecuteRebaseDependentsTool(),
    createGitHubActionRequestTool(),
    createSubmitGitHubActionTool(),
    createValidateArtifactTool(),
    createRunSupervisorStepTool(),
  ];
}
