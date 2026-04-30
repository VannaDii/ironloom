import { describe, expect, it } from 'vitest';

import {
  createCommandExecutionPolicy,
  createCommandResult,
  describeCommandResult,
  isSuccessfulCommandResult,
  truncateCommandOutput,
} from './logic.js';

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
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  }
});
