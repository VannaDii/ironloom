import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDevplatOpenClawTools } from '@vannadii/devplat-openclaw';

/**
 * Tool name for the continuation planner.
 */
const CONTINUE_LIFECYCLE_TOOL_NAME = 'continue_lifecycle';

/**
 * Default loop bound so bad plans cannot spin forever.
 */
const DEFAULT_MAX_STEPS = 8;

/**
 * Successful artifact status used when a delegated result has no status field.
 */
const DEFAULT_ARTIFACT_STATUS = 'complete';

/**
 * Tool result status that indicates a delegated tool failed closed.
 */
const FAILED_TOOL_STATUS = 'failed';

/**
 * Report status for loops that stop at a human approval gate.
 */
const BLOCKED_STATUS = 'blocked';

/**
 * Report status for loops that need caller-provided tool input.
 */
const WAITING_FOR_INPUT_STATUS = 'waiting-for-input';

/**
 * Report status for loops that hit the configured step bound.
 */
const MAX_STEPS_REACHED_STATUS = 'max-steps-reached';

/**
 * Report status for loops that receive a failed delegated tool response.
 */
const FAILED_STATUS = 'failed';

/**
 * Artifact type ownership for tool results that do not declare a missing type.
 */
const TOOL_ARTIFACT_TYPES = {
  create_research_brief: 'research-brief',
  create_spec_record: 'spec-record',
  approve_spec_record: 'spec-record',
  create_slice_plan: 'slice-plan',
  create_task_record: 'task-record',
  allocate_worktree: 'worktree-allocation',
  run_gates: 'gate-run-report',
  create_remediation_plan: 'remediation-plan',
  create_pull_request_record: 'pull-request-record',
  submit_pull_request_update: 'pull-request-record',
  submit_pull_request_merge: 'pull-request-record',
  plan_rebase_dependents: 'rebase-result',
};

/**
 * Common result fields that can identify a lifecycle artifact.
 */
const ARTIFACT_ID_FIELDS = [
  'artifactId',
  'researchId',
  'specId',
  'sliceId',
  'taskId',
  'id',
  'allocationId',
  'reportId',
  'pullRequestId',
  'rebaseId',
];

/**
 * Parses command-line flags for the headless maintenance runner.
 */
export function parseHeadlessMaintenanceRunnerArgs(argv) {
  const parsed = {
    json: false,
    maxSteps: undefined,
    planPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case '--json':
        parsed.json = true;
        break;
      case '--max-steps':
        parsed.maxSteps = Number(argv[index + 1]);
        index += 1;
        break;
      case '--plan':
        parsed.planPath = argv[index + 1];
        index += 1;
        break;
      default:
        throw new Error(`Unknown headless maintenance option: ${token}`);
    }
  }

  return parsed;
}

/**
 * Runs a bounded headless lifecycle maintenance loop.
 */
export async function runHeadlessMaintenanceLoop({
  maxSteps = DEFAULT_MAX_STEPS,
  request,
  toolInputs = {},
  tools = createDevplatOpenClawTools(),
}) {
  const toolMap = createToolMap(tools);
  const finalRequest = cloneContinuationRequest(request);
  const decisions = [];
  const executedSteps = [];
  const toolUseCounts = new Map();

  for (let index = 0; index < maxSteps; index += 1) {
    const iteration = index + 1;
    const decision = await executeTool({
      params: finalRequest,
      toolCallId: `maintenance-${String(iteration)}-continue`,
      toolMap,
      toolName: CONTINUE_LIFECYCLE_TOOL_NAME,
    });
    decisions.push(decision);

    const nextAction = readNextAction(decision);
    const blockers = readStringArray(decision.blockers);

    if (blockers.length > 0 || nextAction.requiresHumanApproval === true) {
      return createReport({
        blockers,
        decisions,
        executedSteps,
        finalRequest,
        nextAction,
        status: BLOCKED_STATUS,
      });
    }

    const toolName = readString(nextAction.toolName, 'nextAction.toolName');
    const toolInput = consumeToolInput({
      toolInputs,
      toolName,
      toolUseCounts,
    });

    if (toolInput === undefined) {
      return createReport({
        blockers: [],
        decisions,
        executedSteps,
        finalRequest,
        nextAction,
        status: WAITING_FOR_INPUT_STATUS,
      });
    }

    const toolResult = await executeTool({
      params: toolInput.params,
      toolCallId: `maintenance-${String(iteration)}-${toolName}`,
      toolMap,
      toolName,
    });

    if (isFailedToolResult(toolResult)) {
      return createReport({
        blockers: [`${toolName} failed`],
        decisions,
        executedSteps,
        finalRequest,
        nextAction,
        status: FAILED_STATUS,
      });
    }

    const artifactSignal = resolveArtifactSignal({
      nextAction,
      fallbackUpdatedAt: finalRequest.updatedAt,
      toolInput,
      toolName,
      toolResult,
    });

    if (artifactSignal !== undefined) {
      finalRequest.artifacts.push(artifactSignal);
    }

    executedSteps.push({
      artifactSignal,
      iteration,
      toolName,
    });
  }

  return createReport({
    blockers: [`maximum step count reached: ${String(maxSteps)}`],
    decisions,
    executedSteps,
    finalRequest,
    nextAction:
      decisions.length === 0
        ? undefined
        : readNextAction(decisions[decisions.length - 1]),
    status: MAX_STEPS_REACHED_STATUS,
  });
}

/**
 * Loads and parses a JSON loop plan from disk.
 */
async function readPlan(planPath) {
  const contents = await readFile(resolve(planPath), 'utf8');
  return JSON.parse(contents);
}

/**
 * Creates a lookup map for registered tools.
 */
function createToolMap(tools) {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

/**
 * Executes one registered platform tool and returns its structured details.
 */
async function executeTool({ params, toolCallId, toolMap, toolName }) {
  const tool = toolMap.get(toolName);

  if (tool === undefined) {
    throw new Error(`Unknown platform tool: ${toolName}`);
  }

  const result = await tool.execute(toolCallId, params);
  return readToolDetails(result);
}

/**
 * Reads structured details from a platform tool response.
 */
function readToolDetails(result) {
  if (!isRecord(result) || !('details' in result)) {
    throw new Error('Tool response must include details.');
  }

  return result.details;
}

/**
 * Returns the next action from a continuation decision.
 */
function readNextAction(decision) {
  if (!isRecord(decision) || !isRecord(decision.nextAction)) {
    throw new Error('Continuation decision must include nextAction.');
  }

  return decision.nextAction;
}

/**
 * Consumes the next supplied input for a tool.
 */
function consumeToolInput({ toolInputs, toolName, toolUseCounts }) {
  const entries = normalizeToolEntries(toolInputs[toolName]);
  const currentCount = toolUseCounts.get(toolName) ?? 0;
  const entry = entries[currentCount];

  if (entry === undefined) {
    return undefined;
  }

  toolUseCounts.set(toolName, currentCount + 1);
  return normalizeToolInputEntry(entry);
}

/**
 * Normalizes a tool input entry or list of entries.
 */
function normalizeToolEntries(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

/**
 * Normalizes a single tool input entry.
 */
function normalizeToolInputEntry(entry) {
  if (isRecord(entry) && 'params' in entry) {
    return {
      artifactSignal: isRecord(entry.artifactSignal)
        ? normalizeArtifactSignal(entry.artifactSignal)
        : undefined,
      params: entry.params,
    };
  }

  return {
    artifactSignal: undefined,
    params: entry,
  };
}

/**
 * Resolves the artifact signal emitted by a completed platform tool.
 */
function resolveArtifactSignal({
  fallbackUpdatedAt,
  nextAction,
  toolInput,
  toolName,
  toolResult,
}) {
  if (toolInput.artifactSignal !== undefined) {
    return toolInput.artifactSignal;
  }

  const artifactType =
    readFirstString(nextAction.missingArtifactTypes) ??
    TOOL_ARTIFACT_TYPES[toolName];
  const artifactId = readResultArtifactId(toolResult);

  if (artifactType === undefined || artifactId === undefined) {
    return undefined;
  }

  return normalizeArtifactSignal({
    artifactId,
    artifactType,
    status: readArtifactStatus(toolResult),
    updatedAt: readOptionalString(toolResult.updatedAt) ?? fallbackUpdatedAt,
  });
}

/**
 * Normalizes an artifact signal before it is fed into the next continuation call.
 */
function normalizeArtifactSignal(value) {
  return {
    artifactId: readString(value.artifactId, 'artifactSignal.artifactId'),
    artifactType: readString(value.artifactType, 'artifactSignal.artifactType'),
    status: readString(value.status, 'artifactSignal.status'),
    updatedAt: readString(value.updatedAt, 'artifactSignal.updatedAt'),
  };
}

/**
 * Reads the lifecycle status that should be associated with a tool result.
 */
function readArtifactStatus(toolResult) {
  const approvalState = readOptionalString(toolResult.approvalState);
  if (approvalState !== undefined) {
    return approvalState;
  }

  const status = readOptionalString(toolResult.status);
  return status === undefined || status === 'running'
    ? DEFAULT_ARTIFACT_STATUS
    : status;
}

/**
 * Reads a likely artifact id from a delegated tool result.
 */
function readResultArtifactId(toolResult) {
  const operationalArtifactId = isRecord(toolResult.operationalResult)
    ? readOptionalString(toolResult.operationalResult.artifactId)
    : undefined;

  if (operationalArtifactId !== undefined) {
    return operationalArtifactId;
  }

  for (const field of ARTIFACT_ID_FIELDS) {
    const value = readOptionalString(toolResult[field]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

/**
 * Returns true when a delegated tool reports failure.
 */
function isFailedToolResult(toolResult) {
  return isRecord(toolResult) && toolResult.status === FAILED_TOOL_STATUS;
}

/**
 * Clones the mutable request state used across loop iterations.
 */
function cloneContinuationRequest(request) {
  if (!isRecord(request)) {
    throw new Error('Maintenance plan must include a request object.');
  }

  return {
    ...request,
    artifacts: Array.isArray(request.artifacts) ? [...request.artifacts] : [],
  };
}

/**
 * Creates a stable report for callers and CLI output.
 */
function createReport({
  blockers,
  decisions,
  executedSteps,
  finalRequest,
  nextAction,
  status,
}) {
  return {
    status,
    blockers,
    nextAction,
    decisions,
    executedSteps,
    finalRequest,
  };
}

/**
 * Reads a required string value.
 */
function readString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

/**
 * Reads an optional string value.
 */
function readOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

/**
 * Reads the first string from an optional array.
 */
function readFirstString(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.find((item) => typeof item === 'string');
}

/**
 * Reads a string array from an optional value.
 */
function readStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : [];
}

/**
 * Returns true when a value is a non-array object.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runs the command-line entrypoint.
 */
async function main() {
  const args = parseHeadlessMaintenanceRunnerArgs(process.argv.slice(2));

  if (args.planPath === undefined) {
    throw new Error('Usage: npm run maintenance:headless -- --plan <file>');
  }

  const plan = await readPlan(args.planPath);
  const report = await runHeadlessMaintenanceLoop({
    ...plan,
    maxSteps: args.maxSteps ?? plan.maxSteps,
  });

  console.log(JSON.stringify(report, undefined, 2));

  if (
    report.status === FAILED_STATUS ||
    report.status === MAX_STEPS_REACHED_STATUS
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
