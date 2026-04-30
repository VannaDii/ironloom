import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  definePluginEntry,
  type OpenClawPluginConfigSchema,
} from 'openclaw/plugin-sdk/plugin-entry';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  OpenClawPluginConfigCodec,
  PluginConfigService,
} from './plugin-config/index.js';
import {
  createApproveSpecRecordTool,
  createAllocateWorktreeTool,
  createApprovalRecordTool,
  createArtifactEnvelopeTool,
  createAuditLogTool,
  createBindDiscordThreadTool,
  createClaimTaskTool,
  createEvaluateSlicePlanReadinessTool,
  createExecuteCommandTool,
  createEvaluatePolicyActionTool,
  createEvaluateSonarQualityGateTool,
  createGitHubActionRequestTool,
  createMergeDecisionTool,
  createRemediationPlanTool,
  createRememberMemoryEntryTool,
  createRecordTelemetryEventTool,
  createTaskRecordTool,
  createReadStoredRecordTool,
  createRebaseResultTool,
  createReviewFindingTool,
  createHandleDiscordApprovalTool,
  createHandleDiscordControlTool,
  createListStoredRecordsTool,
  createOpenDiscordThreadTool,
  createResolveRuntimeConfigTool,
  createReleaseWorktreeTool,
  createOpenClawPluginConfigTool,
  createResearchBriefTool,
  createRunGatesTool,
  createRunSupervisorStepTool,
  createSubmitPullRequestMergeTool,
  createSyncWorktreeTool,
  createPlanRebaseDependentsTool,
  createPullRequestRecordTool,
  createSlicePlanTool,
  createSpecRecordTool,
  createStoreRecordTool,
  createSubmitGitHubActionTool,
  createSubmitPullRequestUpdateTool,
  createUpdateTaskTool,
  createUpdateSpecRecordTool,
  createValidateArtifactTool,
  createVerifySonarBootstrapTool,
  createExecuteRebaseDependentsTool,
} from './tool-surfaces/service.js';

type PluginJsonSchema = NonNullable<OpenClawPluginConfigSchema['jsonSchema']>;

function isPluginJsonSchema(value: unknown): value is PluginJsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSchema(fileName: string): PluginJsonSchema {
  const filePath = resolve(import.meta.dirname, '..', 'schemas', fileName);
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isPluginJsonSchema(parsed)) {
    throw new Error(`Schema ${fileName} must contain a JSON object.`);
  }

  return parsed;
}

function validatePluginConfig(value: unknown):
  | {
      ok: true;
      value?: unknown;
    }
  | {
      ok: false;
      errors: string[];
    } {
  const decoded = decodeWithCodec(OpenClawPluginConfigCodec, value);
  if (!decoded.ok) {
    return {
      ok: false,
      errors: [decoded.error],
    };
  }

  return {
    ok: true,
    value: new PluginConfigService().execute(decoded.value),
  };
}

const configSchema: OpenClawPluginConfigSchema = {
  validate: validatePluginConfig,
  jsonSchema: readSchema('plugin-config.schema.json'),
};

const devplatOpenClawPlugin = definePluginEntry({
  id: '@vannadii/devplat-openclaw',
  name: 'DevPlat OpenClaw Adapter',
  description:
    'OpenClaw capability bridge for the DevPlat Discord-first platform.',
  configSchema,
  register(api) {
    api.registerTool(createResearchBriefTool());
    api.registerTool(createSpecRecordTool());
    api.registerTool(createApproveSpecRecordTool());
    api.registerTool(createUpdateSpecRecordTool());
    api.registerTool(createSlicePlanTool());
    api.registerTool(createEvaluateSlicePlanReadinessTool());
    api.registerTool(createResolveRuntimeConfigTool());
    api.registerTool(createOpenClawPluginConfigTool());
    api.registerTool(createArtifactEnvelopeTool());
    api.registerTool(createApprovalRecordTool());
    api.registerTool(createAuditLogTool());
    api.registerTool(createMergeDecisionTool());
    api.registerTool(createRebaseResultTool());
    api.registerTool(createExecuteCommandTool());
    api.registerTool(createRunGatesTool());
    api.registerTool(createAllocateWorktreeTool());
    api.registerTool(createSyncWorktreeTool());
    api.registerTool(createReleaseWorktreeTool());
    api.registerTool(createBindDiscordThreadTool());
    api.registerTool(createOpenDiscordThreadTool());
    api.registerTool(createHandleDiscordApprovalTool());
    api.registerTool(createHandleDiscordControlTool());
    api.registerTool(createVerifySonarBootstrapTool());
    api.registerTool(createEvaluateSonarQualityGateTool());
    api.registerTool(createReviewFindingTool());
    api.registerTool(createRemediationPlanTool());
    api.registerTool(createRememberMemoryEntryTool());
    api.registerTool(createEvaluatePolicyActionTool());
    api.registerTool(createRecordTelemetryEventTool());
    api.registerTool(createTaskRecordTool());
    api.registerTool(createClaimTaskTool());
    api.registerTool(createUpdateTaskTool());
    api.registerTool(createReadStoredRecordTool());
    api.registerTool(createListStoredRecordsTool());
    api.registerTool(createStoreRecordTool());
    api.registerTool(createPullRequestRecordTool());
    api.registerTool(createSubmitPullRequestUpdateTool());
    api.registerTool(createSubmitPullRequestMergeTool());
    api.registerTool(createPlanRebaseDependentsTool());
    api.registerTool(createExecuteRebaseDependentsTool());
    api.registerTool(createGitHubActionRequestTool());
    api.registerTool(createSubmitGitHubActionTool());
    api.registerTool(createValidateArtifactTool());
    api.registerTool(createRunSupervisorStepTool());
  },
});

export default devplatOpenClawPlugin;

export * from './plugin-config/index.js';
export * from './tool-surfaces/index.js';
