import type {
  CommandExecutionOptions,
  CommandExecutionPolicy,
  CommandResult,
} from './codec.js';

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

export function createCommandExecutionPolicy(
  input: CommandExecutionOptions,
): CommandExecutionPolicy {
  const attempts = Math.max(1, Math.trunc(input.retry?.attempts ?? 1));
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
      retryableExitCodes: [1, 124],
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

export function isSuccessfulCommandResult(input: CommandResult): boolean {
  return input.exitCode === 0 && !input.timedOut;
}

export function describeCommandResult(input: CommandResult): string {
  return `${input.command} -> exit ${String(input.exitCode)}`;
}
