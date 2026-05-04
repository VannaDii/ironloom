import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COMMAND_EXECUTION_CWD_ABSOLUTE_ERROR } from './constants.js';
import { CommandExecutionService } from './service.js';

describe('CommandExecutionService', () => {
  const cases = [
    {
      name: 'executes subprocesses and captures structured output',
      inputs: {
        args: [
          '-e',
          'process.stdout.write(process.env.DEVPLAT_TEST_VALUE ?? "")',
        ],
        options: {
          env: {
            DEVPLAT_TEST_VALUE: 'ok',
          },
        },
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: {
          args: string[];
          options: Parameters<CommandExecutionService['execute']>[2];
        },
      ) => {
        const snapshot = await service.execute(
          process.execPath,
          inputs.args,
          inputs.options,
        );

        expect(snapshot.exitCode).toBe(0);
        expect(snapshot.stdout).toBe('ok');
        expect(service.explain(snapshot)).toContain('exit 0');
      },
    },
    {
      name: 'returns structured failures when spawning fails',
      inputs: {
        command: 'definitely-not-a-real-command-devplat',
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: { command: string },
      ) => {
        const snapshot = await service.execute(inputs.command);

        expect(snapshot.exitCode).toBe(1);
        expect(snapshot.stderr.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'captures stderr output from failing subprocesses',
      inputs: {
        args: ['-e', 'process.stderr.write("bad"); process.exit(2)'],
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: { args: string[] },
      ) => {
        const snapshot = await service.execute(process.execPath, inputs.args);

        expect(snapshot.exitCode).toBe(2);
        expect(snapshot.stderr).toBe('bad');
      },
    },
    {
      name: 'terminates subprocesses when timeouts are exceeded',
      inputs: {
        args: ['-e', 'setTimeout(() => {}, 1_000)'],
        options: { timeoutMs: 25 },
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: {
          args: string[];
          options: Parameters<CommandExecutionService['execute']>[2];
        },
      ) => {
        const snapshot = await service.execute(
          process.execPath,
          inputs.args,
          inputs.options,
        );

        expect(snapshot.timedOut).toBe(true);
        expect(snapshot.exitCode).toBe(124);
      },
    },
    {
      name: 'normalizes signal-only subprocess exits without timeout state',
      inputs: {
        args: ['-e', 'process.kill(process.pid, "SIGTERM")'],
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: { args: string[] },
      ) => {
        const snapshot = await service.execute(process.execPath, inputs.args);

        expect(snapshot.timedOut).toBe(false);
        expect(snapshot.exitCode).toBe(1);
      },
    },
    {
      name: 'retries failed subprocesses and truncates captured output',
      inputs: {
        args: [
          '-e',
          'process.stdout.write("abcdef"); process.stderr.write("ghijkl"); process.exit(1)',
        ],
        options: { maxOutputBytes: 3, retry: { attempts: 2 } },
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: {
          args: string[];
          options: Parameters<CommandExecutionService['execute']>[2];
        },
      ) => {
        const snapshot = await service.execute(
          process.execPath,
          inputs.args,
          inputs.options,
        );

        expect(snapshot.attempts).toBe(2);
        expect(snapshot.stdout).toBe('abc');
        expect(snapshot.stderr).toBe('ghi');
        expect(snapshot.truncated).toBe(true);
      },
    },
    {
      name: 'does not retry non-retryable subprocess exit codes',
      inputs: {
        args: ['-e', 'process.stderr.write("bad"); process.exit(2)'],
        options: { retry: { attempts: 3 } },
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: {
          args: string[];
          options: Parameters<CommandExecutionService['execute']>[2];
        },
      ) => {
        const snapshot = await service.execute(
          process.execPath,
          inputs.args,
          inputs.options,
        );

        expect(snapshot.exitCode).toBe(2);
        expect(snapshot.attempts).toBe(1);
        expect(snapshot.stderr).toBe('bad');
      },
    },
    {
      name: 'refuses absolute command working directories before spawning',
      inputs: {
        args: ['-e', 'process.exit(0)'],
        options: { cwd: process.cwd(), retry: { attempts: 3 } },
      },
      mock: () => new CommandExecutionService(),
      assert: async (
        service: CommandExecutionService,
        inputs: {
          args: string[];
          options: Parameters<CommandExecutionService['execute']>[2];
        },
      ) => {
        const snapshot = await service.execute(
          process.execPath,
          inputs.args,
          inputs.options,
        );

        expect(snapshot.exitCode).toBe(1);
        expect(snapshot.attempts).toBe(1);
        expect(snapshot.stderr).toBe(COMMAND_EXECUTION_CWD_ABSOLUTE_ERROR);
      },
    },
    {
      name: 'executes commands from safe repository-relative working directories',
      inputs: {
        args: [
          '-e',
          'process.stdout.write(process.cwd().endsWith("packages/execution") ? "inside" : process.cwd())',
        ],
        options: { cwd: 'packages/execution' },
      },
      mock: () =>
        new CommandExecutionService(
          resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'),
        ),
      assert: async (
        service: CommandExecutionService,
        inputs: {
          args: string[];
          options: Parameters<CommandExecutionService['execute']>[2];
        },
      ) => {
        const snapshot = await service.execute(
          process.execPath,
          inputs.args,
          inputs.options,
        );

        expect(snapshot.exitCode).toBe(0);
        expect(snapshot.stdout).toBe('inside');
      },
    },
  ];

  it.each(cases)('$name', async ({ inputs, mock, assert }) => {
    expect.hasAssertions();
    await assert(mock(), inputs);
  });
});
