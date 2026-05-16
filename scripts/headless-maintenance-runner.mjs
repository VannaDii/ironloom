import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeWithCodec } from '@vannadii/devplat-core';
import { createDevplatOpenClawTools } from '@vannadii/devplat-openclaw';
import {
  SupervisorContinuationArtifactSignalCodec,
  SupervisorContinuationRequestCodec,
} from '@vannadii/devplat-supervisor';
import * as t from 'io-ts';

/**
 * Tool name for the continuation planner.
 */
const CONTINUE_LIFECYCLE_TOOL_NAME = 'continue_lifecycle';

/**
 * Default loop bound so bad plans cannot spin forever.
 */
const DEFAULT_MAX_STEPS = 8;

/**
 * Smallest accepted loop bound.
 */
const MINIMUM_MAX_STEPS = 1;

/**
 * Successful process exit code.
 */
const SUCCESS_EXIT_CODE = 0;

/**
 * Failing process exit code.
 */
const FAILURE_EXIT_CODE = 1;

/**
 * Offset from a flag token to its consumed value token.
 */
const NEXT_TOKEN_OFFSET = 1;

/**
 * Plan file command-line flag.
 */
const PLAN_FLAG = '--plan';

/**
 * Maximum step command-line flag.
 */
const MAX_STEPS_FLAG = '--max-steps';

/**
 * Continuation handoff plan command-line flag.
 */
const WRITE_PLAN_FLAG = '--write-plan';

/**
 * Usage text emitted when required CLI input is missing.
 */
const USAGE_TEXT =
  'Usage: npm run maintenance:headless -- --plan <file> [--write-plan <file>]';

/**
 * Indentation used for machine-readable JSON artifacts.
 */
const JSON_INDENTATION_SPACES = 2;

/**
 * Positive integer codec for loop bounds loaded from external JSON.
 */
const PositiveIntegerCodec = new t.Type(
  'PositiveInteger',
  (value) => typeof value === 'number' && isPositiveInteger(value),
  (value, context) =>
    typeof value === 'number' && isPositiveInteger(value)
      ? t.success(value)
      : t.failure(value, context),
  t.identity,
);

/**
 * Generic plan codec for the JSON boundary.
 */
const HeadlessMaintenancePlanCodec = t.intersection([
  t.type({
    request: SupervisorContinuationRequestCodec,
  }),
  t.partial({
    maxSteps: PositiveIntegerCodec,
    toolInputs: t.UnknownRecord,
  }),
]);

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
    maxSteps: undefined,
    planPath: undefined,
    writePlanPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case MAX_STEPS_FLAG:
        parsed.maxSteps = parseMaxStepsFlag(
          readRequiredFlagValue(argv, index, MAX_STEPS_FLAG),
        );
        index += NEXT_TOKEN_OFFSET;
        break;
      case PLAN_FLAG:
        parsed.planPath = readRequiredFlagValue(argv, index, PLAN_FLAG);
        index += NEXT_TOKEN_OFFSET;
        break;
      case WRITE_PLAN_FLAG:
        parsed.writePlanPath = readRequiredFlagValue(
          argv,
          index,
          WRITE_PLAN_FLAG,
        );
        index += NEXT_TOKEN_OFFSET;
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
  const loopMaxSteps = readPositiveInteger(maxSteps, 'maxSteps');
  const toolMap = createToolMap(tools);
  const finalRequest = cloneContinuationRequest(request);
  const decisions = [];
  const executedSteps = [];
  const toolUseCounts = new Map();

  for (let index = 0; index < loopMaxSteps; index += 1) {
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
    blockers: [`maximum step count reached: ${String(loopMaxSteps)}`],
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
  const parsed = parsePlanJson(contents);

  return validateHeadlessMaintenancePlan(parsed);
}

/**
 * Writes a resumable maintenance plan to disk.
 */
async function writePlan(planPath, plan) {
  await writeFile(
    resolve(planPath),
    `${JSON.stringify(plan, undefined, JSON_INDENTATION_SPACES)}\n`,
    'utf8',
  );
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
  toolResult,
}) {
  if (toolInput.artifactSignal !== undefined) {
    return toolInput.artifactSignal;
  }

  if (!isRecord(toolResult)) {
    return undefined;
  }

  const artifactType = readFirstString(nextAction.missingArtifactTypes);
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
  const decoded = decodeWithCodec(
    SupervisorContinuationArtifactSignalCodec,
    value,
  );

  if (!decoded.ok) {
    throw new Error(`Maintenance artifact signal is invalid: ${decoded.error}`);
  }

  return decoded.value;
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
  const decoded = decodeWithCodec(SupervisorContinuationRequestCodec, request);

  if (!decoded.ok) {
    throw new Error(`Maintenance plan request is invalid: ${decoded.error}`);
  }

  return {
    ...decoded.value,
    artifacts: [...decoded.value.artifacts],
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
 * Creates a resumable plan from the latest continuation report.
 */
function createHandoffPlan({ maxSteps, report, toolInputs }) {
  return {
    request: report.finalRequest,
    toolInputs,
    ...(maxSteps === undefined ? {} : { maxSteps }),
  };
}

/**
 * Returns true when a value is an allowed positive integer.
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= MINIMUM_MAX_STEPS;
}

/**
 * Reads and validates a positive integer input.
 */
function readPositiveInteger(value, label) {
  if (!isPositiveInteger(value)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

/**
 * Reads a required flag value and rejects another option in its place.
 */
function readRequiredFlagValue(argv, flagIndex, flagName) {
  const value = argv[flagIndex + NEXT_TOKEN_OFFSET];

  if (value === undefined || isOptionToken(value)) {
    throw new Error(`${flagName} requires a value.`);
  }

  return value;
}

/**
 * Parses the maximum step flag value.
 */
function parseMaxStepsFlag(value) {
  const parsed = Number(value);

  return readPositiveInteger(parsed, `${MAX_STEPS_FLAG} value`);
}

/**
 * Returns true when a token is another command-line option.
 */
function isOptionToken(value) {
  return value.startsWith('--');
}

/**
 * Parses maintenance plan JSON with a clear boundary error.
 */
function parsePlanJson(contents) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `Maintenance plan JSON is invalid: ${readErrorMessage(error)}`,
      { cause: error },
    );
  }
}

/**
 * Validates a parsed maintenance plan at the JSON boundary.
 */
function validateHeadlessMaintenancePlan(value) {
  const decoded = decodeWithCodec(HeadlessMaintenancePlanCodec, value);

  if (!decoded.ok) {
    throw new Error(`Maintenance plan is invalid: ${decoded.error}`);
  }

  return {
    request: decoded.value.request,
    ...(decoded.value.maxSteps === undefined
      ? {}
      : { maxSteps: decoded.value.maxSteps }),
    toolInputs: validatePlanToolInputs(decoded.value.toolInputs ?? {}),
  };
}

/**
 * Validates the generic tool-input map in a maintenance plan.
 */
function validatePlanToolInputs(value) {
  if (!isRecord(value)) {
    throw new Error('Maintenance plan toolInputs must be an object.');
  }

  return Object.fromEntries(
    Object.entries(value).map(([toolName, entries]) => [
      readString(toolName, 'toolInputs tool name'),
      validatePlanToolInputEntries(toolName, entries),
    ]),
  );
}

/**
 * Validates one tool's input entry or entry list.
 */
function validatePlanToolInputEntries(toolName, value) {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      validatePlanToolInputEntry(toolName, entry, index),
    );
  }

  return validatePlanToolInputEntry(toolName, value, undefined);
}

/**
 * Validates one generic platform tool input entry.
 */
function validatePlanToolInputEntry(toolName, entry, index) {
  const label =
    index === undefined
      ? `toolInputs.${toolName}`
      : `toolInputs.${toolName}[${String(index)}]`;

  if (!isRecord(entry)) {
    throw new Error(`${label} must be an object.`);
  }

  if (!('params' in entry)) {
    return entry;
  }

  if (!isRecord(entry.params)) {
    throw new Error(`${label}.params must be an object.`);
  }

  return {
    params: entry.params,
    ...('artifactSignal' in entry
      ? { artifactSignal: normalizeArtifactSignal(entry.artifactSignal) }
      : {}),
  };
}

/**
 * Reads an error message from an unknown thrown value.
 */
function readErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
export async function main({
  argv = process.argv.slice(2),
  tools = createDevplatOpenClawTools(),
  writeOutput = console.log,
} = {}) {
  const args = parseHeadlessMaintenanceRunnerArgs(argv);

  if (args.planPath === undefined) {
    throw new Error(USAGE_TEXT);
  }

  const plan = await readPlan(args.planPath);
  const maxSteps = args.maxSteps ?? plan.maxSteps;
  const report = await runHeadlessMaintenanceLoop({
    ...plan,
    maxSteps,
    tools,
  });

  if (args.writePlanPath !== undefined) {
    await writePlan(
      args.writePlanPath,
      createHandoffPlan({
        maxSteps,
        report,
        toolInputs: plan.toolInputs,
      }),
    );
  }

  writeOutput(JSON.stringify(report, undefined, JSON_INDENTATION_SPACES));

  if (
    report.status === FAILED_STATUS ||
    report.status === MAX_STEPS_REACHED_STATUS
  ) {
    return {
      exitCode: FAILURE_EXIT_CODE,
      report,
    };
  }

  return {
    exitCode: SUCCESS_EXIT_CODE,
    report,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await main();
  process.exitCode = result.exitCode;
}
