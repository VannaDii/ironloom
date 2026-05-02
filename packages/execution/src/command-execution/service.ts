import { spawn } from 'node:child_process';

import {
  createCommandResult,
  createCommandExecutionPolicy,
  describeCommandResult,
  isSuccessfulCommandResult,
  truncateCommandOutput,
} from './logic.js';
import type { CommandExecutionOptions, CommandResult } from './codec.js';

export class CommandExecutionService {
  public async execute(
    command: string,
    args: readonly string[] = [],
    options: CommandExecutionOptions = {},
  ): Promise<CommandResult> {
    const attempts = Math.max(1, Math.trunc(options.retry?.attempts ?? 1));
    let attempt = 1;
    let result = await this.executeOnce(command, args, options, attempt);

    while (!isSuccessfulCommandResult(result) && attempt < attempts) {
      attempt += 1;
      result = await this.executeOnce(command, args, options, attempt);
    }

    return result;
  }

  private async executeOnce(
    command: string,
    args: readonly string[],
    options: CommandExecutionOptions,
    attempt: number,
  ): Promise<CommandResult> {
    const startedAt = Date.now();

    return new Promise((resolvePromise) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const settle = (exitCode: number): void => {
        if (settled) {
          return;
        }

        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolvePromise(
          this.normalizeCapturedResult(
            {
              command,
              args: [...args],
              exitCode,
              timedOut,
              stdout,
              stderr,
              durationMs: Date.now() - startedAt,
              attempts: attempt,
              policy: createCommandExecutionPolicy(options),
            },
            options,
          ),
        );
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error: Error) => {
        stderr = error.message;
        settle(1);
      });
      child.on('close', (code: number | null) => {
        settle(code ?? (timedOut ? 124 : 1));
      });

      if (typeof options.timeoutMs === 'number' && options.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, options.timeoutMs);
      }
    });
  }

  private normalizeCapturedResult(
    input: CommandResult,
    options: CommandExecutionOptions,
  ): CommandResult {
    const stdout = truncateCommandOutput(input.stdout, options.maxOutputBytes);
    const stderr = truncateCommandOutput(input.stderr, options.maxOutputBytes);
    return createCommandResult({
      ...input,
      stdout: stdout.value,
      stderr: stderr.value,
      truncated: stdout.truncated || stderr.truncated,
    });
  }

  public explain(input: CommandResult): string {
    return describeCommandResult(input);
  }
}
