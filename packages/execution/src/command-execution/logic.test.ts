import { describe, expect, it } from 'vitest';

import {
  createCommandResult,
  describeCommandResult,
  isSuccessfulCommandResult,
  truncateCommandOutput,
} from './logic.js';

describe('CommandResult logic', () => {
  it('normalizes command results and evaluates success', () => {
    const snapshot = createCommandResult({
      command: 'node',
      args: ['-e', 'process.stdout.write("ok")'],
      exitCode: 0,
      timedOut: false,
      stdout: 'ok',
      stderr: '',
      durationMs: -1,
    });

    expect(snapshot.durationMs).toBe(0);
    expect(isSuccessfulCommandResult(snapshot)).toBe(true);
    expect(describeCommandResult(snapshot)).toContain('exit 0');
  });

  it('truncates command output using byte limits', () => {
    const cases = [
      {
        inputs: {
          value: 'abcdef',
          maxOutputBytes: 3,
        },
        mock: () => undefined,
        assert: (output: ReturnType<typeof truncateCommandOutput>) => {
          expect(output).toEqual({ value: 'abc', truncated: true });
        },
      },
      {
        inputs: {
          value: 'ok',
          maxOutputBytes: 3,
        },
        mock: () => undefined,
        assert: (output: ReturnType<typeof truncateCommandOutput>) => {
          expect(output).toEqual({ value: 'ok', truncated: false });
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(
        truncateCommandOutput(
          testCase.inputs.value,
          testCase.inputs.maxOutputBytes,
        ),
      );
    }
  });
});
