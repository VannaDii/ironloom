import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { CommandExecutionOptionsCodec } from './codec.js';
import {
  normalizeCommandExecutionCwd,
  createCommandExecutionPolicy,
  createCommandResult,
  describeCommandResult,
  isSuccessfulCommandResult,
  truncateCommandOutput,
} from './logic.js';
import {
  COMMAND_EXECUTION_CWD_ABSOLUTE_ERROR,
  COMMAND_EXECUTION_CWD_TRAVERSAL_ERROR,
} from './constants.js';

describe('CommandResult logic', () => {
  const cases = [
    {
      name: 'normalizes command results and evaluates success',
      inputs: {
        result: {
          command: 'node',
          args: ['-e', 'process.stdout.write("ok")'],
          exitCode: 0,
          timedOut: false,
          stdout: 'ok',
          stderr: '',
          durationMs: -1,
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        result: Parameters<typeof createCommandResult>[0];
      }) => {
        const snapshot = createCommandResult(inputs.result);

        expect(snapshot.durationMs).toBe(0);
        expect(isSuccessfulCommandResult(snapshot)).toBe(true);
        expect(describeCommandResult(snapshot)).toContain('exit 0');
      },
    },
    {
      name: 'truncates command output when byte limits are exceeded',
      inputs: {
        value: 'abcdef',
        maxOutputBytes: 3,
      },
      mock: () => undefined,
      assert: (inputs: { value: string; maxOutputBytes: number }) => {
        expect(
          truncateCommandOutput(inputs.value, inputs.maxOutputBytes),
        ).toEqual({
          value: 'abc',
          truncated: true,
        });
      },
    },
    {
      name: 'keeps command output when byte limits are not exceeded',
      inputs: {
        value: 'ok',
        maxOutputBytes: 3,
      },
      mock: () => undefined,
      assert: (inputs: { value: string; maxOutputBytes: number }) => {
        expect(
          truncateCommandOutput(inputs.value, inputs.maxOutputBytes),
        ).toEqual({
          value: 'ok',
          truncated: false,
        });
      },
    },
    {
      name: 'normalizes retry timeout and truncation policy contracts',
      inputs: {
        options: {
          retry: { attempts: 3 },
          timeoutMs: 50.4,
          maxOutputBytes: 8.9,
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        options: Parameters<typeof createCommandExecutionPolicy>[0];
      }) => {
        expect(createCommandExecutionPolicy(inputs.options)).toEqual({
          retry: {
            attempts: 3,
            retryableExitCodes: [1, 124],
          },
          truncation: {
            maxOutputBytes: 8,
            mode: 'bytes',
          },
          timeoutMs: 50,
        });
      },
    },
    {
      name: 'normalizes configured retryable subprocess exit codes',
      inputs: {
        options: {
          retry: { attempts: 3, retryableExitCodes: [2.8, 75] },
        },
      },
      mock: () => undefined,
      assert: (inputs: { options: unknown }) => {
        const decoded = decodeWithCodec(
          CommandExecutionOptionsCodec,
          inputs.options,
        );

        expect(decoded.ok).toBe(true);
        if (!decoded.ok) {
          return;
        }

        expect(createCommandExecutionPolicy(decoded.value)).toEqual({
          retry: {
            attempts: 3,
            retryableExitCodes: [2, 75],
          },
        });
      },
    },
    {
      name: 'falls back to a single retry attempt for invalid policy values',
      inputs: {
        options: {
          retry: { attempts: 0 },
          timeoutMs: -1,
          maxOutputBytes: 0,
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        options: Parameters<typeof createCommandExecutionPolicy>[0];
      }) => {
        expect(createCommandExecutionPolicy(inputs.options)).toEqual({
          retry: {
            attempts: 1,
            retryableExitCodes: [1, 124],
          },
        });
      },
    },
    {
      name: 'normalizes blank command cwd values to the repository root',
      inputs: {
        cwd: '   ',
        expectedCwd: undefined,
      },
      mock: () => undefined,
      assert: (inputs: { cwd: string; expectedCwd: string | undefined }) => {
        expect(normalizeCommandExecutionCwd(inputs.cwd)).toEqual({
          ok: true,
          ...(inputs.expectedCwd === undefined
            ? {}
            : { value: inputs.expectedCwd }),
        });
      },
    },
    {
      name: 'normalizes nested relative command cwd values',
      inputs: {
        cwd: ' packages/../packages/execution ',
        expectedCwd: 'packages/execution',
      },
      mock: () => undefined,
      assert: (inputs: { cwd: string; expectedCwd: string | undefined }) => {
        expect(normalizeCommandExecutionCwd(inputs.cwd)).toEqual({
          ok: true,
          ...(inputs.expectedCwd === undefined
            ? {}
            : { value: inputs.expectedCwd }),
        });
      },
    },
    {
      name: 'rejects absolute command cwd values',
      inputs: {
        cwd: process.cwd(),
        expectedError: COMMAND_EXECUTION_CWD_ABSOLUTE_ERROR,
      },
      mock: () => undefined,
      assert: (inputs: { cwd: string; expectedError: string }) => {
        expect(normalizeCommandExecutionCwd(inputs.cwd)).toEqual({
          ok: false,
          error: inputs.expectedError,
        });
      },
    },
    {
      name: 'rejects command cwd traversal outside the repository root',
      inputs: {
        cwd: '../outside',
        expectedError: COMMAND_EXECUTION_CWD_TRAVERSAL_ERROR,
      },
      mock: () => undefined,
      assert: (inputs: { cwd: string; expectedError: string }) => {
        expect(normalizeCommandExecutionCwd(inputs.cwd)).toEqual({
          ok: false,
          error: inputs.expectedError,
        });
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});
