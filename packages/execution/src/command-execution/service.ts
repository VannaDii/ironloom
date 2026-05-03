import { spawn } from 'node:child_process';
import { join } from 'node:path';

import {
  createCommandResult,
  createCommandExecutionPolicy,
  describeCommandResult,
  isSuccessfulCommandResult,
  normalizeCommandExecutionCwd,
  truncateCommandOutput,
} from './logic.js';
import type { CommandExecutionOptions, CommandResult } from './codec.js';

export class CommandExecutionService {
  /**
   * Creates the command execution service with the repository root boundary.
   */
  public constructor(private readonly repositoryRoot = process.cwd()) {}

  /**
   * Executes a command after normalizing the working-directory boundary.
   */
  public async execute(
    command: string,
    args: readonly string[] = [],
    options: CommandExecutionOptions = {},
  ): Promise<CommandResult> {
    const normalizedCwd = normalizeCommandExecutionCwd(options.cwd);
    if (!normalizedCwd.ok) {
      return this.createRefusedResult(
        command,
        args,
        options,
        normalizedCwd.error,
      );
    }

    const executionOptions = {
      ...options,
      cwd:
        normalizedCwd.value === undefined
          ? this.repositoryRoot
          : join(this.repositoryRoot, normalizedCwd.value),
    };
    const attempts = Math.max(1, Math.trunc(options.retry?.attempts ?? 1));
    let attempt = 1;
    let result = await this.executeOnce(
      command,
      args,
      executionOptions,
      attempt,
    );

    while (!isSuccessfulCommandResult(result) && attempt < attempts) {
      attempt += 1;
      result = await this.executeOnce(command, args, executionOptions, attempt);
    }

    return result;
  }

  /**
   * Creates a command result for policy-refused execution before spawning.
   */
  private createRefusedResult(
    command: string,
    args: readonly string[],
    options: CommandExecutionOptions,
    reason: string,
  ): CommandResult {
    return this.normalizeCapturedResult(
      {
        command,
        args: [...args],
        exitCode: 1,
        timedOut: false,
        stdout: '',
        stderr: reason,
        durationMs: 0,
        attempts: 1,
        policy: createCommandExecutionPolicy(options),
      },
      options,
    );
  }

  /**
   * Executes one subprocess attempt and captures its streams.
   */
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

  /**
   * Applies output truncation and canonical result normalization.
   */
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

  /**
   * Describes a command result for operator output.
   */
  public explain(input: CommandResult): string {
    return describeCommandResult(input);
  }
}
