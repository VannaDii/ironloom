import { describe, expect, it } from 'vitest';
import type { CommandResult } from '@vannadii/devplat-execution';

import {
  classifyGateRun,
  createGateCheckResult,
  createGateRunReport,
  describeGateRunReport,
  getNpmCommand,
  resolveGateCommand,
  runGates,
} from './logic.js';

describe('GateRunReport logic', () => {
  it('selects the correct npm binary for supported platforms', () => {
    expect(getNpmCommand('darwin')).toBe('npm');
    expect(getNpmCommand('win32')).toBe('npm.cmd');
  });

  it('resolves gate names to npm run invocations', () => {
    expect(resolveGateCommand(' lint ')).toEqual({
      command: getNpmCommand(),
      args: ['run', 'lint'],
    });
  });

  it('creates a passed gate report for successful commands', async () => {
    const executeGate = async (
      command: string,
      args: readonly string[],
    ): Promise<CommandResult> => ({
      command,
      args: [...args],
      exitCode: 0,
      timedOut: false,
      stdout: '',
      stderr: '',
      durationMs: 10,
    });
    const report = await runGates(
      ['lint', 'typecheck', 'test'],
      'Run default gates',
      executeGate,
    );
    expect(report.passed).toBe(true);
    expect(report.results).toHaveLength(3);
    expect(describeGateRunReport(report)).toContain('passed');
  });

  it('marks timed out commands as failed gate checks', async () => {
    const report = await runGates(['test'], 'Timeout gate', async () => ({
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['run', 'test'],
      exitCode: 124,
      timedOut: true,
      stdout: '',
      stderr: 'timed out',
      durationMs: 25,
    }));

    expect(report.passed).toBe(false);
    expect(report.nextAction).toBe('retry-gates');
    expect(report.classification?.kind).toBe('retryable');
    expect(report.results[0]).toMatchObject({
      name: 'test',
      success: false,
      detail: expect.stringContaining('(timed out)'),
      failureKind: 'timeout',
    });
  });

  it('describes failed gate reports', () => {
    const report = createGateRunReport({
      id: 'gate-run-report',
      summary: '  failed gates  ',
      status: 'failed',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      passed: false,
      results: [{ name: 'lint', success: false, detail: 'lint failed' }],
    });

    expect(report.trace).toContain('gates:failed');
    expect(report.nextAction).toBe('create-remediation-plan');
    expect(describeGateRunReport(report)).toContain('failed');
  });

  it('classifies gate failures with next-action hints', () => {
    const cases = [
      {
        inputs: {
          result: createGateCheckResult('lint', {
            command: 'npm',
            args: ['run', 'lint'],
            exitCode: 1,
            timedOut: false,
            stdout: '',
            stderr: 'lint failed',
            durationMs: 10,
          }),
        },
        mock: () => undefined,
        assert: (classification: ReturnType<typeof classifyGateRun>) => {
          expect(classification).toEqual({
            kind: 'requires-remediation',
            failedGateNames: ['lint'],
            nextAction: 'create-remediation-plan',
          });
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(classifyGateRun([testCase.inputs.result]));
    }
  });
});
