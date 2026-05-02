import { appendTrace } from '@vannadii/devplat-core';
import {
  describeCommandResult,
  isSuccessfulCommandResult,
  type CommandResult,
} from '@vannadii/devplat-execution';

import type {
  GateCheckResult,
  GateFailureClassification,
  GateFailureKind,
  GateRemediationHook,
  GateRunReport,
} from './codec.js';

type GateNextAction = 'retry-gates' | 'remediate-failure' | 'continue';

export interface GateCommandSpec {
  command: string;
  args: string[];
}

export type GateExecutor = (
  command: string,
  args: readonly string[],
) => Promise<CommandResult>;

export function getNpmCommand(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function resolveGateCommand(gateName: string): GateCommandSpec {
  const trimmedName = gateName.trim();
  return {
    command: getNpmCommand(),
    args: ['run', trimmedName],
  };
}

export function createGateCheckResult(
  gateName: string,
  commandResult: CommandResult,
): GateCheckResult {
  const success = isSuccessfulCommandResult(commandResult);
  const failureKind = resolveGateFailureKind(success, commandResult);
  const nextAction = resolveGateNextAction(failureKind);
  return {
    name: gateName.trim(),
    success,
    detail: `${describeCommandResult(commandResult)}${commandResult.timedOut ? ' (timed out)' : ''}`,
    failureKind,
    nextAction,
  };
}

function resolveGateFailureKind(
  success: boolean,
  commandResult: CommandResult,
): GateFailureKind {
  if (success) {
    return 'passed';
  }

  if (commandResult.timedOut) {
    return 'timeout';
  }

  return 'command-failed';
}

function resolveGateNextAction(failureKind: GateFailureKind): GateNextAction {
  if (failureKind === 'timeout') {
    return 'retry-gates';
  }

  if (failureKind === 'command-failed') {
    return 'remediate-failure';
  }

  return 'continue';
}

export function classifyGateRun(
  results: readonly GateCheckResult[],
): GateFailureClassification {
  const failedGateNames = results
    .filter((result) => !result.success)
    .map((result) => result.name);

  if (failedGateNames.length === 0) {
    return {
      kind: 'passed',
      failedGateNames,
      nextAction: 'continue',
    };
  }

  const onlyTimeouts = results
    .filter((result) => !result.success)
    .every((result) => result.failureKind === 'timeout');

  return {
    kind: onlyTimeouts ? 'retryable' : 'requires-remediation',
    failedGateNames,
    nextAction: onlyTimeouts ? 'retry-gates' : 'create-remediation-plan',
  };
}

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function createGateFindingId(gateName: string): string {
  return `gate:${gateName.trim()}`;
}

function createGateRemediationAction(result: GateCheckResult): string {
  return `Fix ${result.name.trim()} gate failure: ${result.detail.trim()}`;
}

export function createGateRemediationHook(
  input: GateRunReport,
): GateRemediationHook {
  const classification = input.classification ?? classifyGateRun(input.results);
  const failedResults = input.results.filter((result) => !result.success);
  const remediationResults = failedResults.filter(
    (result) => result.failureKind !== 'timeout',
  );
  const retryableGateNames = uniqueTrimmed(
    failedResults
      .filter((result) => result.failureKind === 'timeout')
      .map((result) => result.name),
  );
  const failedGateNames = uniqueTrimmed(
    classification.failedGateNames.length === 0
      ? failedResults.map((result) => result.name)
      : classification.failedGateNames,
  );
  const remediationGateNames = uniqueTrimmed(
    remediationResults.map((result) => result.name),
  );

  return {
    hookId: `${input.id.trim()}:remediation-hook`,
    gateRunReportId: input.id.trim(),
    failedGateNames,
    retryableGateNames,
    remediationFindingIds: remediationGateNames.map(createGateFindingId),
    actions: uniqueTrimmed(remediationResults.map(createGateRemediationAction)),
    autofixEligible:
      remediationResults.length > 0 &&
      remediationResults.every(
        (result) => result.failureKind === 'command-failed',
      ),
    approvalRequired: true,
    nextAction: 'create-remediation-plan',
    createdAt: new Date(input.updatedAt).toISOString(),
  };
}

export function createGateRunReport(input: GateRunReport): GateRunReport {
  const classification = input.classification ?? classifyGateRun(input.results);
  const normalizedInput: GateRunReport = {
    ...input,
    summary: input.summary.trim(),
    updatedAt: new Date(input.updatedAt).toISOString(),
    classification,
    nextAction: input.nextAction ?? classification.nextAction,
  };
  const remediationHook =
    input.remediationHook ??
    (classification.kind === 'requires-remediation'
      ? createGateRemediationHook(normalizedInput)
      : undefined);
  return appendTrace(
    {
      ...normalizedInput,
      ...(remediationHook === undefined ? {} : { remediationHook }),
    },
    `gates:${input.passed ? 'passed' : 'failed'}`,
  );
}

export async function runGates(
  gateNames: string[],
  summary: string,
  executeGate: GateExecutor,
): Promise<GateRunReport> {
  const results: GateCheckResult[] = [];

  for (const gateName of gateNames) {
    const command = resolveGateCommand(gateName);
    const commandResult = await executeGate(command.command, command.args);
    results.push(createGateCheckResult(gateName, commandResult));
  }

  return createGateRunReport({
    id: 'gate-run-report',
    summary,
    status: 'complete',
    trace: [],
    updatedAt: new Date().toISOString(),
    passed: results.every((result) => result.success),
    results,
  });
}

export function describeGateRunReport(input: GateRunReport): string {
  return `${String(input.results.length)} gates -> ${input.passed ? 'passed' : 'failed'}`;
}
