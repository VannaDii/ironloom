import { isAbsolute, normalize, sep } from 'node:path';

import type {
  CommandExecutionOptions,
  CommandExecutionPolicy,
  CommandResult,
} from './codec.js';
import {
  COMMAND_EXECUTION_CWD_ABSOLUTE_ERROR,
  COMMAND_EXECUTION_DEFAULT_RETRYABLE_EXIT_CODES,
  COMMAND_EXECUTION_CWD_TRAVERSAL_ERROR,
} from './constants.js';

/** Normalized command working-directory result. */
export type NormalizedCommandExecutionCwd =
  | {
      ok: true;
      value?: string;
    }
  | {
      ok: false;
      error: string;
    };

/** Truncate command output. */
export function truncateCommandOutput(
  value: string,
  maxOutputBytes: number | undefined,
): { value: string; truncated: boolean } {
  if (typeof maxOutputBytes !== 'number' || maxOutputBytes <= 0) {
    return { value, truncated: false };
  }

  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxOutputBytes) {
    return { value, truncated: false };
  }

  return {
    value: buffer.subarray(0, maxOutputBytes).toString(),
    truncated: true,
  };
}

/**
 * Normalizes optional command cwd input without allowing repository escape.
 */
export function normalizeCommandExecutionCwd(
  cwd: string | undefined,
): NormalizedCommandExecutionCwd {
  if (cwd === undefined) {
    return { ok: true };
  }

  const trimmed = cwd.trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }

  if (isAbsolute(trimmed)) {
    return {
      ok: false,
      error: COMMAND_EXECUTION_CWD_ABSOLUTE_ERROR,
    };
  }

  const normalized = normalize(trimmed);
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) {
    return {
      ok: false,
      error: COMMAND_EXECUTION_CWD_TRAVERSAL_ERROR,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

/** Creates command result. */
export function createCommandResult(input: CommandResult): CommandResult {
  return {
    ...input,
    command: input.command.trim(),
    args: [...input.args],
    stdout: input.stdout,
    stderr: input.stderr,
    durationMs: Math.max(0, input.durationMs),
    ...(input.attempts === undefined ? {} : { attempts: input.attempts }),
    ...(input.truncated === undefined ? {} : { truncated: input.truncated }),
    ...(input.policy === undefined ? {} : { policy: input.policy }),
  };
}

/** Creates command execution policy. */
export function createCommandExecutionPolicy(
  input: CommandExecutionOptions,
): CommandExecutionPolicy {
  const attempts = Math.max(1, Math.trunc(input.retry?.attempts ?? 1));
  const retryableExitCodes =
    input.retry?.retryableExitCodes === undefined
      ? [...COMMAND_EXECUTION_DEFAULT_RETRYABLE_EXIT_CODES]
      : input.retry.retryableExitCodes.map((exitCode) => Math.trunc(exitCode));
  const timeoutMs =
    typeof input.timeoutMs === 'number' && input.timeoutMs > 0
      ? Math.trunc(input.timeoutMs)
      : undefined;
  const maxOutputBytes =
    typeof input.maxOutputBytes === 'number' && input.maxOutputBytes > 0
      ? Math.trunc(input.maxOutputBytes)
      : undefined;

  return {
    retry: {
      attempts,
      retryableExitCodes,
    },
    ...(maxOutputBytes === undefined
      ? {}
      : {
          truncation: {
            maxOutputBytes,
            mode: 'bytes',
          },
        }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

/** Returns whether the command result succeeded. */
export function isSuccessfulCommandResult(input: CommandResult): boolean {
  return input.exitCode === 0 && !input.timedOut;
}

/** Describes command result. */
export function describeCommandResult(input: CommandResult): string {
  return `${input.command} -> exit ${String(input.exitCode)}`;
}
